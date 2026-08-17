import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, crawlEvents, crawlPages, crawlPlans, crawlSessions, crawlStepHistory, documentAssets, findingWorkflowStates, scanEvents, scanFindings, scanJobs, scanRateLimits, scanReports, users, workspaceMembers, workspaces } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function consumeScanQuota(userId: number, limit = 5) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const minuteBucket = Math.floor(Date.now() / 60_000);
  await db.insert(scanRateLimits).values({ userId, minuteBucket, count: 1 }).onDuplicateKeyUpdate({
    set: {
      minuteBucket: sql`IF(${scanRateLimits.minuteBucket} = ${minuteBucket}, ${scanRateLimits.minuteBucket}, ${minuteBucket})`,
      count: sql`IF(${scanRateLimits.minuteBucket} = ${minuteBucket}, ${scanRateLimits.count} + 1, 1)`,
    },
  });
  const current = await db.select().from(scanRateLimits).where(eq(scanRateLimits.userId, userId)).limit(1);
  return (current[0]?.minuteBucket === minuteBucket && (current[0]?.count ?? 0) <= limit);
}

export async function ensureWorkspaceForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const existing = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (existing[0]) {
    const membership = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, existing[0].id), eq(workspaceMembers.userId, userId))).limit(1);
    if (!membership[0]) await db.insert(workspaceMembers).values({ workspaceId: existing[0].id, userId });
    return existing[0];
  }
  const result = await db.insert(workspaces).values({ ownerId: userId, name: 'Personal workspace' });
  const workspace = (await db.select().from(workspaces).where(eq(workspaces.id, Number(result[0].insertId))).limit(1))[0];
  if (workspace) await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId });
  return workspace;
}

export async function createScanReport(input: typeof scanReports.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  let snapshotJson = input.snapshotJson;
  if (!snapshotJson) {
    const job = (await db.select().from(scanJobs).where(eq(scanJobs.id, input.scanJobId)).limit(1))[0];
    const findings = await db.select().from(scanFindings).where(eq(scanFindings.scanJobId, input.scanJobId)).orderBy(desc(scanFindings.createdAt));
    const document = (await db.select().from(documentAssets).where(eq(documentAssets.scanJobId, input.scanJobId)).limit(1))[0];
    snapshotJson = JSON.stringify({ version: 1, job, findings, document });
  }
  await db.insert(scanReports).values({ ...input, snapshotJson });
}

export async function listReportsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ report: scanReports, job: scanJobs }).from(scanReports).innerJoin(scanJobs, eq(scanReports.scanJobId, scanJobs.id)).where(eq(scanJobs.userId, userId)).orderBy(desc(scanReports.createdAt)).limit(50);
}

export async function getReportForUser(reportId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ report: scanReports, job: scanJobs }).from(scanReports).innerJoin(scanJobs, eq(scanReports.scanJobId, scanJobs.id)).where(and(eq(scanReports.id, reportId), eq(scanJobs.userId, userId))).limit(1);
  return rows[0];
}

export async function getReportDetailForUser(reportId: number, userId: number) {
  const base = await getReportForUser(reportId, userId);
  if (!base) return undefined;
  if (base.report.snapshotJson) {
    try {
      const snapshot = JSON.parse(base.report.snapshotJson) as { findings?: Array<typeof scanFindings.$inferSelect>; document?: typeof documentAssets.$inferSelect | null };
      const findings = Array.isArray(snapshot.findings) ? snapshot.findings : [];
      const pages = base.job.scanType === "crawl" ? await listCrawlPagesForUser(base.job.id, base.job.userId) : [];
      return { ...base, findings: await mergeFindingWorkflowStates(findings, base.job.userId), document: snapshot.document ?? null, pages };
    } catch {
      // Fall through for a malformed or legacy snapshot rather than exposing a broken response.
    }
  }
  const [findings, document] = await Promise.all([
    listFindingsForUser(base.job.id, userId),
    getDocumentAssetForScan(base.job.id, userId),
  ]);
  const pages = base.job.scanType === "crawl" ? await listCrawlPagesForUser(base.job.id, base.job.userId) : [];
  return { ...base, findings: await mergeFindingWorkflowStates(findings, base.job.userId), document, pages };
}

async function mergeFindingWorkflowStates(findings: Array<typeof scanFindings.$inferSelect>, userId: number) {
  if (findings.length === 0) return findings.map((finding) => ({ ...finding, workflow: null }));
  const db = await getDb();
  if (!db) return findings.map((finding) => ({ ...finding, workflow: null }));
  const states = await db.select({ state: findingWorkflowStates }).from(findingWorkflowStates).innerJoin(scanFindings, eq(findingWorkflowStates.findingId, scanFindings.id)).innerJoin(scanJobs, eq(scanFindings.scanJobId, scanJobs.id)).where(and(inArray(findingWorkflowStates.findingId, findings.map((finding) => finding.id)), eq(scanJobs.userId, userId)));
  const stateByFinding = new Map(states.map(({ state }) => [state.findingId, state]));
  return findings.map((finding) => ({ ...finding, workflow: stateByFinding.get(finding.id) ?? null }));
}

export async function updateFindingWorkflowState(input: { findingId: number; userId: number; status: 'open' | 'acknowledged' | 'in_progress' | 'verified' | 'closed' }) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const owned = (await db.select({ finding: scanFindings, job: scanJobs }).from(scanFindings).innerJoin(scanJobs, eq(scanFindings.scanJobId, scanJobs.id)).where(and(eq(scanFindings.id, input.findingId), eq(scanJobs.userId, input.userId))).limit(1))[0];
  if (!owned) return undefined;
  const now = new Date();
  const timestampField = input.status === 'acknowledged' ? { acknowledgedAt: now } : input.status === 'in_progress' ? { inProgressAt: now } : input.status === 'verified' ? { verifiedAt: now } : input.status === 'closed' ? { closedAt: now } : {};
  await db.insert(findingWorkflowStates).values({ findingId: input.findingId, status: input.status, updatedBy: input.userId, ...timestampField }).onDuplicateKeyUpdate({ set: { status: input.status, updatedBy: input.userId, ...timestampField } });
  return (await db.select().from(findingWorkflowStates).where(eq(findingWorkflowStates.findingId, input.findingId)).limit(1))[0];
}

export async function getFindingWorkflowStateForUser(findingId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const owned = (await db.select({ finding: scanFindings }).from(scanFindings).innerJoin(scanJobs, eq(scanFindings.scanJobId, scanJobs.id)).where(and(eq(scanFindings.id, findingId), eq(scanJobs.userId, userId))).limit(1))[0];
  if (!owned) return undefined;
  return (await db.select().from(findingWorkflowStates).where(eq(findingWorkflowStates.findingId, findingId)).limit(1))[0] ?? null;
}

export async function createDocumentAsset(input: typeof documentAssets.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const result = await db.insert(documentAssets).values(input);
  const id = Number(result[0].insertId);
  return (await db.select().from(documentAssets).where(eq(documentAssets.id, id)).limit(1))[0];
}

export async function getDocumentAssetForUser(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(documentAssets).where(and(eq(documentAssets.id, id), eq(documentAssets.userId, userId))).limit(1))[0];
}

export async function getDocumentAssetForScan(scanJobId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(documentAssets).where(and(eq(documentAssets.scanJobId, scanJobId), eq(documentAssets.userId, userId))).limit(1))[0];
}

export async function createCrawlPlan(input: typeof crawlPlans.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const result = await db.insert(crawlPlans).values(input);
  const id = Number(result[0].insertId);
  return (await db.select().from(crawlPlans).where(eq(crawlPlans.id, id)).limit(1))[0];
}

export async function createCrawlSession(input: typeof crawlSessions.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const result = await db.insert(crawlSessions).values(input);
  const id = Number(result[0].insertId);
  return (await db.select().from(crawlSessions).where(eq(crawlSessions.id, id)).limit(1))[0];
}

export async function getCrawlSessionForUser(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ session: crawlSessions, plan: crawlPlans, job: scanJobs }).from(crawlSessions).innerJoin(crawlPlans, eq(crawlSessions.scanJobId, crawlPlans.scanJobId)).innerJoin(scanJobs, eq(crawlSessions.scanJobId, scanJobs.id)).where(and(eq(crawlSessions.id, sessionId), eq(crawlSessions.userId, userId), eq(crawlPlans.userId, userId))).limit(1))[0];
}

export async function getCrawlSessionForScan(scanJobId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ session: crawlSessions, plan: crawlPlans, job: scanJobs }).from(crawlSessions).innerJoin(crawlPlans, eq(crawlSessions.scanJobId, crawlPlans.scanJobId)).innerJoin(scanJobs, eq(crawlSessions.scanJobId, scanJobs.id)).where(and(eq(crawlSessions.scanJobId, scanJobId), eq(crawlSessions.userId, userId), eq(crawlPlans.userId, userId))).limit(1))[0];
}

export async function updateCrawlSession(id: number, userId: number, values: Partial<typeof crawlSessions.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  await db.update(crawlSessions).set(values).where(and(eq(crawlSessions.id, id), eq(crawlSessions.userId, userId)));
}

export async function addCrawlEvent(input: typeof crawlEvents.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(crawlEvents).values({ ...input, redacted: 1 });
}

export async function listCrawlEventsForUser(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await getCrawlSessionForUser(sessionId, userId);
  if (!owned) return [];
  return db.select().from(crawlEvents).where(eq(crawlEvents.sessionId, sessionId)).orderBy(crawlEvents.createdAt);
}

export async function addCrawlStepHistory(input: typeof crawlStepHistory.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const session = await db.select().from(crawlSessions).where(eq(crawlSessions.id, input.sessionId)).limit(1);
  if (!session[0]) return undefined;
  const safeDetail = input.detail ? input.detail.replace(/\b(pass(word)?|secret|token|otp|code)\b\s*[:=]\s*\S+/gi, '$1=[redacted]') : input.detail;
  const safeSelectorMetadata = input.selectorMetadataJson
    ? input.selectorMetadataJson.replace(/\b(pass(word)?|secret|token|otp|code)\b\s*[:=]\s*[^,}\s]+/gi, '$1=[redacted]')
    : input.selectorMetadataJson;
  const safeDomSnippet = input.domSnippet
    ? input.domSnippet
        .replace(/\b(pass(word)?|secret|token|otp|code|session|cookie)\b\s*[:=]\s*[^<\s]+/gi, '$1=[redacted]')
        .slice(0, 12_000)
    : input.domSnippet;
  const result = await db.insert(crawlStepHistory).values({ ...input, detail: safeDetail, selectorMetadataJson: safeSelectorMetadata, domSnippet: safeDomSnippet });
  return (await db.select().from(crawlStepHistory).where(eq(crawlStepHistory.id, Number(result[0].insertId))).limit(1))[0];
}

export async function listCrawlStepHistoryForUser(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await getCrawlSessionForUser(sessionId, userId);
  if (!owned) return [];
  return db.select().from(crawlStepHistory).where(eq(crawlStepHistory.sessionId, sessionId)).orderBy(crawlStepHistory.createdAt, crawlStepHistory.id);
}

export async function addCrawlPage(input: typeof crawlPages.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const result = await db.insert(crawlPages).values(input);
  const id = Number(result[0].insertId);
  return (await db.select().from(crawlPages).where(eq(crawlPages.id, id)).limit(1))[0];
}

export async function listCrawlPagesForUser(scanJobId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const job = await getScanJobForUser(scanJobId, userId);
  if (!job) return [];
  return db.select().from(crawlPages).where(eq(crawlPages.scanJobId, scanJobId)).orderBy(crawlPages.createdAt);
}

export async function createScanJob(input: { userId: number; targetUrl: string; scanType: 'url' | 'crawl' | 'document' }) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  const result = await db.insert(scanJobs).values(input);
  const id = Number(result[0].insertId);
  return (await db.select().from(scanJobs).where(eq(scanJobs.id, id)).limit(1))[0];
}

export async function getScanJobForUser(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(scanJobs).where(and(eq(scanJobs.id, id), eq(scanJobs.userId, userId))).limit(1))[0];
}

export async function listScanJobsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scanJobs).where(eq(scanJobs.userId, userId)).orderBy(desc(scanJobs.createdAt)).limit(50);
}

export async function updateScanJob(id: number, values: Partial<typeof scanJobs.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  await db.update(scanJobs).set(values).where(eq(scanJobs.id, id));
}

export async function addScanEvent(input: typeof scanEvents.$inferInsert) {
  const db = await getDb();
  if (!db) return;
  await db.insert(scanEvents).values(input);
}

export async function listScanEventsForUser(scanJobId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await getScanJobForUser(scanJobId, userId);
  if (!owned) return [];
  return db.select().from(scanEvents).where(eq(scanEvents.scanJobId, scanJobId)).orderBy(scanEvents.createdAt);
}

export async function replaceScanFindings(scanJobId: number, findings: Array<typeof scanFindings.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error('Database is not configured.');
  if (findings.length > 0) await db.insert(scanFindings).values(findings);
}

export async function listFindingsForUser(scanJobId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await getScanJobForUser(scanJobId, userId);
  if (!owned) return [];
  return db.select().from(scanFindings).where(eq(scanFindings.scanJobId, scanJobId)).orderBy(desc(scanFindings.createdAt));
}
