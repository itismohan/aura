import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { addCrawlEvent, addCrawlPage, addCrawlStepHistory, addScanEvent, consumeScanQuota, createCrawlPlan, createCrawlSession, createDocumentAsset, createScanJob, createScanReport, ensureWorkspaceForUser, getCrawlSessionForScan, getCrawlSessionForUser, getReportDetailForUser, getReportForUser, getScanJobForUser, getFindingWorkflowStateForUser, listCrawlEventsForUser, listCrawlPagesForUser, listCrawlStepHistoryForUser, listFindingsForUser, listReportsForUser, listScanEventsForUser, listScanJobsForUser, replaceScanFindings, updateCrawlSession, updateFindingWorkflowState, updateScanJob } from "./db";
import { assertPublicTarget, runDocumentScan, runUrlScan, sniffDocumentContent, validateTargetUrl } from "./scan-engine";
import { storagePut } from "./storage";
import { publishScanEvent } from "./scan-events";
import { scanQuotaMessage, shouldConsumeScanQuota } from "./scan-quota";
import { publishCrawlEvent } from "./crawl-events";
import { cancelCrawlRuntime, sendTakeoverAction, startCrawlRuntime, type CrawlCredentials, type CrawlRuntimeEvent, type CrawlStep } from "./crawl-runner";

async function recordScanEvent(event: { scanJobId: number; stage: string; message: string; progress: number; status?: 'completed' | 'failed' | 'cancelled' }) {
  await addScanEvent(event);
  publishScanEvent(event);
}


async function assertScanActive(scanJobId: number, userId: number) {
  const job = await getScanJobForUser(scanJobId, userId);
  if (!job || job.status === 'cancelled') throw new Error('SCAN_CANCELLED');
}

const findingStatuses = ['open', 'acknowledged', 'in_progress', 'verified', 'closed'] as const;
type FindingStatus = typeof findingStatuses[number];

const allowedFindingTransitions: Record<FindingStatus, FindingStatus[]> = {
  open: ['acknowledged'],
  acknowledged: ['open', 'in_progress'],
  in_progress: ['acknowledged', 'verified'],
  verified: ['in_progress', 'closed'],
  closed: ['verified'],
};

async function waitForScanResume(scanJobId: number, userId: number) {
  while (true) {
    const job = await getScanJobForUser(scanJobId, userId);
    if (!job || job.status === 'cancelled') throw new Error('SCAN_CANCELLED');
    if (job.status !== 'paused') return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function executeDocumentScan(scanJobId: number, userId: number, filename: string, content: string) {
  try {
    await waitForScanResume(scanJobId, userId);
    await updateScanJob(scanJobId, { status: 'running', progress: 2, startedAt: new Date() });
    const result = await runDocumentScan(content, filename, async (stage, message, progress) => {
      await waitForScanResume(scanJobId, userId);
      await updateScanJob(scanJobId, { progress });
      await recordScanEvent({ scanJobId, stage, message, progress });
    });
    await replaceScanFindings(scanJobId, result.findings.map((finding) => ({ ...finding, scanJobId })));
    await updateScanJob(scanJobId, { status: 'completed', progress: 100, score: result.score, totalFindings: result.findings.length, completedAt: new Date() });
    await createScanReport({ scanJobId, title: result.title, summary: `${result.findings.length} evidence-backed findings collected.`, score: result.score });
    await recordScanEvent({ scanJobId, stage: 'complete', message: `Document scan complete for ${result.title}`, progress: 100 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The document scan failed.';
    if (message === 'SCAN_CANCELLED') {
      await recordScanEvent({ scanJobId, stage: 'cancelled', message: 'Scan cancelled by user', progress: 100, status: 'cancelled' });
      return;
    }
    await updateScanJob(scanJobId, { status: 'failed', errorMessage: message, completedAt: new Date() });
    await recordScanEvent({ scanJobId, stage: 'error', message, progress: 100 });
  }
}

async function executeCrawlScan(input: { scanJobId: number; userId: number; sessionId: number; startUrl: string; allowedUrls: string[]; steps: CrawlStep[]; credentials: CrawlCredentials }) {
  let findingCount = 0;
  let penalty = 0;
  const weight: Record<string, number> = { critical: 25, serious: 15, moderate: 8, minor: 3 };
  const score = () => Math.max(0, 100 - penalty);
  const emit = async (event: CrawlRuntimeEvent) => {
    if (event.type === "step") {
      let evidenceFields: { screenshotKey?: string; screenshotUrl?: string; selector?: string; selectorMetadataJson?: string; domSnippet?: string } = {};
      if (event.evidence?.dataUrl) {
        const encoded = event.evidence.dataUrl.split(",", 2)[1];
        if (encoded) {
          const uploaded = await storagePut(`crawl-evidence/${input.userId}/${input.sessionId}/step-${event.stepIndex}.jpg`, Buffer.from(encoded, "base64"), "image/jpeg");
          evidenceFields = {
            screenshotKey: uploaded.key,
            screenshotUrl: uploaded.url,
            selector: event.evidence.selector,
            selectorMetadataJson: event.evidence.selectorMetadata ? JSON.stringify(event.evidence.selectorMetadata) : undefined,
            domSnippet: event.evidence.domSnippet,
          };
        }
      }
      await addCrawlStepHistory({ sessionId: input.sessionId, stepIndex: event.stepIndex ?? 0, stepType: event.stepType ?? "wait", status: event.status as "started" | "succeeded" | "failed" | "waiting", label: event.label ?? "Manual crawl step", url: event.url, detail: event.detail, ...evidenceFields, startedAt: event.status === "started" ? new Date() : undefined, completedAt: event.status !== "started" && event.status !== "waiting" ? new Date() : undefined });
    }
    await addCrawlEvent({ sessionId: input.sessionId, stage: event.type === "state" ? event.status : event.type === "step" ? `step_${event.status}` : event.type, message: event.type === "screenshot" ? "Live browser frame updated." : event.type === "step" ? event.detail ?? event.label ?? "Crawl step updated." : event.type === "state" ? event.message ?? event.status : event.message, redacted: 1 });
    if (event.type === "state") {
      const sessionStatus = event.status === "running" ? "running" : event.status;
      await updateCrawlSession(input.sessionId, input.userId, { status: sessionStatus, currentStep: event.currentStep ?? 0, currentUrl: event.currentUrl });
      if (event.status === "completed") {
        await updateScanJob(input.scanJobId, { status: "completed", progress: 100, score: score(), totalFindings: findingCount, completedAt: new Date() });
        await createScanReport({ scanJobId: input.scanJobId, title: `Authenticated crawl — ${new URL(input.startUrl).hostname}`, summary: `Scanned ${findingCount} evidence-backed finding${findingCount === 1 ? "" : "s"} across approved authenticated pages.`, score: score() });
      } else if (event.status === "failed") {
        await updateScanJob(input.scanJobId, { status: "failed", errorMessage: event.message ?? "Authenticated crawl failed.", completedAt: new Date() });
      } else if (event.status === "cancelled") {
        await updateScanJob(input.scanJobId, { status: "cancelled", completedAt: new Date() });
      }
    }
    publishCrawlEvent({ ...event, sessionId: input.sessionId } as Parameters<typeof publishCrawlEvent>[0]);
  };
  try {
    await updateScanJob(input.scanJobId, { status: "running", progress: 2, startedAt: new Date() });
    await startCrawlRuntime({
      sessionId: input.sessionId,
      startUrl: input.startUrl,
      allowedUrls: input.allowedUrls,
      steps: input.steps,
      credentials: input.credentials,
      hooks: {
        onEvent: async (event) => {
          await emit(event);
          if (event.type === "state" && event.status === "running") {
            const progress = input.steps.length ? Math.min(95, Math.round((event.currentStep / input.steps.length) * 95)) : 2;
            await updateScanJob(input.scanJobId, { progress });
          }
        },
        onPageScan: async (page) => {
          const findings = page.findings.map((finding) => ({ ...finding, scanJobId: input.scanJobId }));
          if (findings.length) await replaceScanFindings(input.scanJobId, findings);
          findingCount += findings.length;
          penalty += findings.reduce((sum, finding) => sum + (weight[finding.severity] ?? 0), 0);
          await addCrawlPage({ scanJobId: input.scanJobId, sessionId: input.sessionId, url: page.url, title: page.title.slice(0, 255), findingCount: findings.length, score: Math.max(0, 100 - findings.reduce((sum, finding) => sum + (weight[finding.severity] ?? 0), 0)) });
        },
        isCancelled: async () => (await getScanJobForUser(input.scanJobId, input.userId))?.status === "cancelled",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authenticated crawl failed.";
    await updateCrawlSession(input.sessionId, input.userId, { status: "failed" });
    await updateScanJob(input.scanJobId, { status: "failed", errorMessage: message, completedAt: new Date() });
  }
}

async function executeScan(scanJobId: number, userId: number, targetUrl: string) {
  try {
    await waitForScanResume(scanJobId, userId);
    await updateScanJob(scanJobId, { status: 'running', progress: 2, startedAt: new Date() });
    const result = await runUrlScan(targetUrl, async (stage, message, progress) => {
      await waitForScanResume(scanJobId, userId);
      await updateScanJob(scanJobId, { progress });
      await recordScanEvent({ scanJobId, stage, message, progress });
    });
    await replaceScanFindings(scanJobId, result.findings.map((finding) => ({ ...finding, scanJobId })));
    await updateScanJob(scanJobId, { status: 'completed', progress: 100, score: result.score, totalFindings: result.findings.length, completedAt: new Date() });
    await createScanReport({ scanJobId, title: result.title, summary: `${result.findings.length} evidence-backed findings collected.`, score: result.score });
    await recordScanEvent({ scanJobId, stage: 'complete', message: `Scan complete for ${result.title}`, progress: 100 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The scan failed.';
    if (message === 'SCAN_CANCELLED') {
      await recordScanEvent({ scanJobId, stage: 'cancelled', message: 'Scan cancelled by user', progress: 100, status: 'cancelled' });
      return;
    }
    await updateScanJob(scanJobId, { status: 'failed', errorMessage: message, completedAt: new Date() });
    await recordScanEvent({ scanJobId, stage: 'error', message, progress: 100 });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  scans: router({
    list: protectedProcedure.query(({ ctx }) => listScanJobsForUser(ctx.user.id)),
    reports: protectedProcedure.query(({ ctx }) => listReportsForUser(ctx.user.id)),
    report: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getReportForUser(input.id, ctx.user.id)),
    reportDetail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getReportDetailForUser(input.id, ctx.user.id)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getScanJobForUser(input.id, ctx.user.id)),
    events: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => listScanEventsForUser(input.id, ctx.user.id)),
    pause: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const job = await getScanJobForUser(input.id, ctx.user.id);
      if (!job) throw new Error('Scan not found.');
      if (job.status !== 'running' && job.status !== 'queued') return { success: true, status: job.status } as const;
      await updateScanJob(input.id, { status: 'paused' });
      await recordScanEvent({ scanJobId: input.id, stage: 'paused', message: 'Scan paused by user', progress: job.progress });
      return { success: true, status: 'paused' as const };
    }),
    resume: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const job = await getScanJobForUser(input.id, ctx.user.id);
      if (!job) throw new Error('Scan not found.');
      if (job.status !== 'paused') return { success: true, status: job.status } as const;
      await updateScanJob(input.id, { status: 'running' });
      await recordScanEvent({ scanJobId: input.id, stage: 'resumed', message: 'Scan resumed by user', progress: job.progress });
      return { success: true, status: 'running' as const };
    }),
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const job = await getScanJobForUser(input.id, ctx.user.id);
      if (!job) throw new Error('Scan not found.');
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return { success: true, status: job.status } as const;
      await cancelCrawlRuntime((await getCrawlSessionForScan(input.id, ctx.user.id))?.session.id ?? -1);
      await updateScanJob(input.id, { status: 'cancelled', completedAt: new Date() });
      await recordScanEvent({ scanJobId: input.id, stage: 'cancelled', message: 'Scan cancellation requested', progress: job.progress, status: 'cancelled' });
      return { success: true, status: 'cancelled' as const };
    }),
    findings: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => listFindingsForUser(input.id, ctx.user.id)),
    crawlSession: protectedProcedure.input(z.object({ scanJobId: z.number().int().positive() })).query(({ ctx, input }) => getCrawlSessionForScan(input.scanJobId, ctx.user.id)),
    crawlEvents: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).query(({ ctx, input }) => listCrawlEventsForUser(input.sessionId, ctx.user.id)),
    crawlHistory: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).query(({ ctx, input }) => listCrawlStepHistoryForUser(input.sessionId, ctx.user.id)),
    crawlPages: protectedProcedure.input(z.object({ scanJobId: z.number().int().positive() })).query(({ ctx, input }) => listCrawlPagesForUser(input.scanJobId, ctx.user.id)),
    crawlInput: protectedProcedure.input(z.object({ sessionId: z.number().int().positive(), action: z.discriminatedUnion('type', [z.object({ type: z.literal('click'), x: z.number().min(0).max(1365), y: z.number().min(0).max(860) }), z.object({ type: z.literal('type'), text: z.string().min(1).max(500) }), z.object({ type: z.literal('key'), key: z.string().min(1).max(20) }), z.object({ type: z.literal('resume') })]) })).mutation(async ({ ctx, input }) => {
      const owned = await getCrawlSessionForUser(input.sessionId, ctx.user.id);
      if (!owned) throw new Error('Crawl session not found.');
      if (owned.session.status !== 'takeover') throw new Error('The crawl is not waiting for live takeover.');
      await sendTakeoverAction(input.sessionId, input.action);
      return { success: true } as const;
    }),
    updateFindingStatus: protectedProcedure.input(z.object({ findingId: z.number().int().positive(), status: z.enum(findingStatuses) })).mutation(async ({ ctx, input }) => {
      const current = await getFindingWorkflowStateForUser(input.findingId, ctx.user.id);
      const currentStatus = current?.status ?? 'open';
      if (currentStatus !== input.status && !allowedFindingTransitions[currentStatus as FindingStatus].includes(input.status)) {
        throw new Error(`Cannot move a finding from ${currentStatus} to ${input.status}.`);
      }
      const updated = await updateFindingWorkflowState({ findingId: input.findingId, userId: ctx.user.id, status: input.status });
      if (!updated) throw new Error('Finding not found.');
      return updated;
    }),
    createDocument: protectedProcedure.input(z.object({ filename: z.string().min(1).max(255), mimeType: z.string().max(120), contentBase64: z.string().max(4_500_000) })).mutation(async ({ ctx, input }) => {
      if (shouldConsumeScanQuota(ctx.user) && !(await consumeScanQuota(ctx.user.id))) throw new Error(scanQuotaMessage());
      const safeName = input.filename.replace(/[^a-z0-9._-]/gi, '-');
      const extension = safeName.toLowerCase().split('.').pop() ?? '';
      const allowedTypes: Record<string, string[]> = {
        html: ['text/html'], htm: ['text/html'], txt: ['text/plain'], md: ['text/markdown', 'text/plain'],
        json: ['application/json', 'text/json'], csv: ['text/csv', 'text/plain'],
      };
      if (!allowedTypes[extension]) throw new Error('Unsupported document type. Upload HTML, Markdown, JSON, CSV, or plain text.');
      if (input.mimeType && !allowedTypes[extension].includes(input.mimeType)) throw new Error('The file extension and MIME type do not match.');
      const bytes = Buffer.from(input.contentBase64, 'base64');
      if (bytes.byteLength > 3_000_000) throw new Error('Document exceeds the 3 MB scan limit.');
      if (bytes.includes(0)) throw new Error('Binary documents are not supported in this beta.');
      const content = sniffDocumentContent(bytes, extension);
      await ensureWorkspaceForUser(ctx.user.id);
      const job = await createScanJob({ userId: ctx.user.id, targetUrl: input.filename, scanType: 'document' });
      if (!job) throw new Error('Could not create document scan job.');
      const stored = await storagePut(`${ctx.user.id}-scans/${Date.now()}-${safeName}`, bytes, input.mimeType || 'text/plain');
      await createDocumentAsset({ userId: ctx.user.id, scanJobId: job.id, filename: safeName, mimeType: input.mimeType || 'text/plain', storageKey: stored.key, storageUrl: stored.url, byteSize: bytes.byteLength });
      void executeDocumentScan(job.id, ctx.user.id, input.filename, content);
      return job;
    }),
    createCrawl: protectedProcedure.input(z.object({
      startUrl: z.string().url().max(2048),
      allowedUrls: z.array(z.string().url().max(2048)).min(1).max(20),
      steps: z.array(z.discriminatedUnion('type', [
        z.object({ type: z.literal('open'), url: z.string().url().max(2048) }),
        z.object({ type: z.literal('fill'), selector: z.string().min(1).max(300), text: z.string().max(500).optional(), credential: z.enum(['username', 'password']).optional() }).refine((step) => Boolean(step.credential || step.text), 'Fill steps require text or a one-time credential token.'),
        z.object({ type: z.literal('click'), selector: z.string().min(1).max(300) }),
        z.object({ type: z.literal('wait'), milliseconds: z.number().int().min(0).max(10_000) }),
        z.object({ type: z.literal('assert_url'), pattern: z.string().min(1).max(300) }),
        z.object({ type: z.literal('mfa_checkpoint'), label: z.string().min(1).max(200) }),
        z.object({ type: z.literal('scan_page') }),
      ])).min(1).max(50),
      credentials: z.object({ username: z.string().min(1).max(300), password: z.string().min(1).max(300) }),
    })).mutation(async ({ ctx, input }) => {
      const startUrl = validateTargetUrl(input.startUrl);
      const allowedUrls = input.allowedUrls.map(validateTargetUrl);
      const startOrigin = new URL(startUrl).origin;
      if (allowedUrls.some((url) => new URL(url).origin !== startOrigin)) throw new Error('All approved crawl URLs must use the same origin as the start URL.');
      await assertPublicTarget(startUrl);
      for (const approvedUrl of allowedUrls) await assertPublicTarget(approvedUrl);
      if (shouldConsumeScanQuota(ctx.user) && !(await consumeScanQuota(ctx.user.id))) throw new Error(scanQuotaMessage());
      for (const step of input.steps) if (step.type === 'open' && !allowedUrls.some((url) => new URL(url).origin === new URL(step.url).origin && new URL(step.url).pathname.startsWith(new URL(url).pathname))) throw new Error('Every open step must target an approved URL path.');
      await ensureWorkspaceForUser(ctx.user.id);
      const job = await createScanJob({ userId: ctx.user.id, targetUrl: startUrl, scanType: 'crawl' });
      if (!job) throw new Error('Could not create authenticated crawl job.');
      const plan = await createCrawlPlan({ userId: ctx.user.id, scanJobId: job.id, startUrl, allowedUrlsJson: JSON.stringify(allowedUrls), stepsJson: JSON.stringify(input.steps) });
      const session = await createCrawlSession({ scanJobId: job.id, userId: ctx.user.id, status: 'starting', currentStep: 0, expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
      if (!plan || !session) throw new Error('Could not create authenticated crawl session.');
      void executeCrawlScan({ scanJobId: job.id, userId: ctx.user.id, sessionId: session.id, startUrl, allowedUrls, steps: input.steps as CrawlStep[], credentials: input.credentials });
      return { job, session: { id: session.id, expiresAt: session.expiresAt } };
    }),
    create: protectedProcedure.input(z.object({ targetUrl: z.string().url().max(2048), scanType: z.enum(['url', 'crawl', 'document']).default('url') })).mutation(async ({ ctx, input }) => {
      if (input.scanType !== 'url') throw new Error('Use the authenticated crawl or document upload action for this scan type.');
      if (shouldConsumeScanQuota(ctx.user) && !(await consumeScanQuota(ctx.user.id))) throw new Error(scanQuotaMessage());
      const targetUrl = validateTargetUrl(input.targetUrl);
      await ensureWorkspaceForUser(ctx.user.id);
      const job = await createScanJob({ userId: ctx.user.id, targetUrl, scanType: input.scanType });
      if (!job) throw new Error('Could not create scan job.');
      void executeScan(job.id, ctx.user.id, targetUrl);
      return job;
    }),
  }),
});

export type AppRouter = typeof appRouter;
