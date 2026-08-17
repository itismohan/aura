import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { analyzeHtml, assertPublicTarget, type DetectedFinding, validateTargetUrl } from "./scan-engine";

type CredentialKey = "username" | "password";
export type CrawlStep =
  | { type: "open"; url: string }
  | { type: "fill"; selector: string; text?: string; credential?: CredentialKey }
  | { type: "click"; selector: string }
  | { type: "wait"; milliseconds: number }
  | { type: "assert_url"; pattern: string }
  | { type: "mfa_checkpoint"; label: string }
  | { type: "scan_page" };

export type CrawlCredentials = { username: string; password: string };
export type CrawlStepEvidence = {
  dataUrl: string;
  selector?: string;
  selectorMetadata?: Record<string, unknown>;
  domSnippet?: string;
};

export type CrawlRuntimeEvent =
  | { type: "log"; stage: string; message: string; url?: string }
  | { type: "screenshot"; dataUrl: string; url: string }
  | { type: "step"; stepIndex: number; stepType: CrawlStep["type"]; status: "started" | "succeeded" | "failed" | "waiting"; label: string; url?: string; detail?: string; evidence?: CrawlStepEvidence }
  | { type: "state"; status: "running" | "takeover" | "completed" | "failed" | "cancelled"; currentStep: number; currentUrl?: string; message?: string };

type RuntimeHooks = {
  onEvent: (event: CrawlRuntimeEvent) => Promise<void> | void;
  onPageScan: (page: { url: string; title: string; findings: DetectedFinding[] }) => Promise<void>;
  isCancelled: () => Promise<boolean>;
};

type Runtime = {
  browser: Browser;
  page: Page;
  hooks: RuntimeHooks;
  steps: CrawlStep[];
  credentials: CrawlCredentials;
  expiresAt: number;
  currentStep: number;
  takeoverResolver?: () => void;
  takeoverRejecter?: (error: Error) => void;
  lastScreenshotAt: number;
};

const runtimes = new Map<number, Runtime>();
const MAX_SESSION_MS = 15 * 60 * 1000;
const MAX_STEPS = 50;
const MAX_SCREENSHOT_BYTES = 650_000;
export const MAX_DOM_SNIPPET_CHARS = 12_000;

function executablePath() {
  return process.env.CHROMIUM_PATH || "/usr/bin/chromium";
}

function allowedUrl(candidate: string, startUrl: string, allowedUrls: string[]) {
  const parsed = new URL(validateTargetUrl(candidate));
  const start = new URL(validateTargetUrl(startUrl));
  if (parsed.origin !== start.origin) throw new Error("Navigation blocked: authenticated crawl steps must stay on the start URL origin.");
  const allowed = allowedUrls.some((pattern) => {
    const normalized = new URL(validateTargetUrl(pattern));
    return parsed.origin === normalized.origin && parsed.pathname.startsWith(normalized.pathname);
  });
  if (!allowed) throw new Error("Navigation blocked: the target URL is not in the approved crawl allowlist.");
  return parsed.toString();
}

export function redactedMessage(message: string) {
  return message.replace(/\b(pass(word)?|secret|token|otp|code)\b\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

export function sanitizeDomSnippet(html: string) {
  const withoutActiveContent = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<(?:noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:noscript|iframe|object|embed)\s*>/gi, "")
    .replace(/(\s(?:value|placeholder|aria-label|title|data-[\w:-]+))=(?:"[^"]*"|'[^']*')/gi, '$1="[redacted]"');
  return withoutActiveContent
    .replace(/(password|passphrase|secret|token|otp|one-time[- ]?code|verification[- ]?code|session|cookie)\s*[:=]\s*[^<\s]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DOM_SNIPPET_CHARS);
}

export function validateCrawlPlan(input: { startUrl: string; allowedUrls: string[]; steps: CrawlStep[] }) {
  if (input.steps.length === 0 || input.steps.length > MAX_STEPS) {
    throw new Error(`Crawl plans must contain between 1 and ${MAX_STEPS} steps.`);
  }
  if (input.allowedUrls.length === 0) throw new Error("Authenticated crawls require at least one approved URL.");
  const start = allowedUrl(input.startUrl, input.startUrl, input.allowedUrls);
  for (const step of input.steps) {
    if (step.type === "open") allowedUrl(step.url, start, input.allowedUrls);
    if (step.type === "wait" && (!Number.isFinite(step.milliseconds) || step.milliseconds < 0)) {
      throw new Error("Wait steps must use a non-negative finite duration.");
    }
    if (step.type === "mfa_checkpoint" && !step.label.trim()) throw new Error("MFA checkpoints require a label.");
  }
  return { startUrl: start, stepCount: input.steps.length };
}

async function screenshot(runtime: Runtime) {
  const now = Date.now();
  if (now - runtime.lastScreenshotAt < 250) return;
  runtime.lastScreenshotAt = now;
  const raw = await runtime.page.screenshot({ type: "jpeg", quality: 55, encoding: "base64" });
  const dataUrl = `data:image/jpeg;base64,${raw}`;
  if (dataUrl.length <= MAX_SCREENSHOT_BYTES) await runtime.hooks.onEvent({ type: "screenshot", dataUrl, url: runtime.page.url() });
}

async function selectorMetadata(runtime: Runtime, step: CrawlStep) {
  const selector = step.type === "fill" || step.type === "click" ? step.selector : undefined;
  if (!selector) return { selector: undefined, selectorMetadata: undefined };
  const metadata = await runtime.page.evaluate((value) => {
    try {
      const nodes = Array.from(document.querySelectorAll(value));
      const first = nodes[0] as HTMLElement | undefined;
      return {
        matchedCount: nodes.length,
        tagName: first?.tagName?.toLowerCase(),
        idPresent: Boolean(first?.id),
        classCount: first?.classList?.length ?? 0,
        role: first?.getAttribute("role") ?? undefined,
        autocomplete: first?.getAttribute("autocomplete") ?? undefined,
      };
    } catch {
      return { matchedCount: 0, invalidSelector: true };
    }
  }, selector);
  return { selector, selectorMetadata: metadata };
}

async function sanitizedEvidence(runtime: Runtime, step: CrawlStep): Promise<CrawlStepEvidence | undefined> {
  const selectorInfo = await selectorMetadata(runtime, step);
  const restore = await runtime.page.evaluate(() => {
    const fields = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
    return fields.map((field) => ({ value: field.value, placeholder: field.getAttribute("placeholder") }));
  }).catch(() => []);
  try {
    await runtime.page.evaluate(() => {
      const fields = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
      for (const field of fields) {
        if (field.value) field.value = "[redacted]";
        if (field.getAttribute("placeholder")) field.setAttribute("placeholder", "[redacted]");
      }
    });
    const domHtml = await runtime.page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script, style, noscript, iframe, object, embed").forEach((node) => node.remove());
      clone.querySelectorAll("input, textarea, select").forEach((field) => {
        field.removeAttribute("value");
        field.setAttribute("value", "[redacted]");
        field.removeAttribute("placeholder");
        field.setAttribute("placeholder", "[redacted]");
      });
      clone.querySelectorAll("[aria-label], [title]").forEach((node) => {
        node.removeAttribute("aria-label");
        node.removeAttribute("title");
      });
      return clone.outerHTML;
    }).catch(() => "");
    const raw = await runtime.page.screenshot({ type: "jpeg", quality: 55, encoding: "base64" });
    const dataUrl = `data:image/jpeg;base64,${raw}`;
    if (dataUrl.length > MAX_SCREENSHOT_BYTES) return undefined;
    return { dataUrl, domSnippet: sanitizeDomSnippet(domHtml), ...selectorInfo };
  } finally {
    await runtime.page.evaluate((fields) => {
      const current = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
      current.forEach((field, index) => {
        const original = fields[index];
        if (original) {
          field.value = original.value;
          if (original.placeholder === null) field.removeAttribute("placeholder");
          else field.setAttribute("placeholder", original.placeholder);
        }
      });
    }, restore).catch(() => undefined);
  }
}

async function log(runtime: Runtime, stage: string, message: string) {
  await runtime.hooks.onEvent({ type: "log", stage, message: redactedMessage(message), url: runtime.page.url() });
}

async function waitForTakeover(runtime: Runtime) {
      await runtime.hooks.onEvent({ type: "step", stepIndex: runtime.currentStep, stepType: "mfa_checkpoint", status: "waiting", label: "Manual MFA takeover", url: runtime.page.url(), detail: "Waiting for the user to complete MFA in the live browser view.", evidence: await sanitizedEvidence(runtime, { type: "mfa_checkpoint", label: "Manual MFA takeover" }) });
  await runtime.hooks.onEvent({ type: "state", status: "takeover", currentStep: runtime.currentStep, currentUrl: runtime.page.url(), message: "Manual takeover required. Complete MFA in the live browser view, then resume the crawl." });
  await screenshot(runtime);
  await new Promise<void>((resolve, reject) => {
    runtime.takeoverResolver = resolve;
    runtime.takeoverRejecter = reject;
  });
}

function stepLabel(step: CrawlStep) {
  switch (step.type) {
    case "open": return `Open ${new URL(step.url).pathname}`;
    case "fill": return step.credential ? `Fill ${step.credential} credential` : `Fill ${step.selector}`;
    case "click": return `Click ${step.selector}`;
    case "wait": return `Wait ${Math.min(step.milliseconds, 10_000)} ms`;
    case "assert_url": return `Assert URL matches ${step.pattern}`;
    case "mfa_checkpoint": return step.label;
    case "scan_page": return "Scan current page";
  }
}

async function executeStep(runtime: Runtime, step: CrawlStep, startUrl: string, allowedUrls: string[]) {
  if (await runtime.hooks.isCancelled()) throw new Error("CRAWL_CANCELLED");
  if (Date.now() > runtime.expiresAt) throw new Error("The authenticated crawl session expired after 15 minutes.");
  switch (step.type) {
    case "open": {
      const target = allowedUrl(step.url, startUrl, allowedUrls);
      await assertPublicTarget(target);
      await runtime.page.goto(target, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await log(runtime, "navigate", `Opened approved page ${new URL(target).pathname}`);
      break;
    }
    case "fill": {
      const value = step.credential ? runtime.credentials[step.credential] : step.text ?? "";
      if (!value && !step.credential) throw new Error("Fill steps require text or a credential token.");
      await runtime.page.waitForSelector(step.selector, { timeout: 10_000 });
      await runtime.page.locator(step.selector).fill(value);
      await log(runtime, "input", `Filled ${step.credential ? "credential field" : "approved field"}`);
      break;
    }
    case "click":
      await runtime.page.waitForSelector(step.selector, { timeout: 10_000 });
      await runtime.page.locator(step.selector).click();
      await runtime.page.waitForNetworkIdle({ idleTime: 250, timeout: 5_000 }).catch(() => undefined);
      await log(runtime, "interaction", "Clicked an approved selector");
      break;
    case "wait":
      await new Promise((resolve) => setTimeout(resolve, Math.min(step.milliseconds, 10_000)));
      await log(runtime, "wait", `Waited ${Math.min(step.milliseconds, 10_000)} milliseconds`);
      break;
    case "assert_url":
      if (!new RegExp(step.pattern).test(runtime.page.url())) throw new Error("URL assertion failed for the current page.");
      await log(runtime, "assert", "URL assertion passed");
      break;
    case "mfa_checkpoint":
      await log(runtime, "takeover", step.label || "Manual MFA checkpoint reached");
      await waitForTakeover(runtime);
      break;
    case "scan_page": {
      const html = await runtime.page.content();
      const title = await runtime.page.title().catch(() => runtime.page.url());
      await runtime.hooks.onPageScan({ url: runtime.page.url(), title, findings: analyzeHtml(html) });
      await log(runtime, "scan", `Captured accessibility evidence for ${new URL(runtime.page.url()).pathname}`);
      break;
    }
  }
}

export async function startCrawlRuntime(input: {
  sessionId: number;
  startUrl: string;
  allowedUrls: string[];
  steps: CrawlStep[];
  credentials: CrawlCredentials;
  hooks: RuntimeHooks;
}) {
  validateCrawlPlan({ startUrl: input.startUrl, allowedUrls: input.allowedUrls, steps: input.steps });
  const browser = await puppeteer.launch({ executablePath: executablePath(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1365, height: 860, deviceScaleFactor: 1 });
  await page.setDefaultTimeout(10_000);
  await page.setDefaultNavigationTimeout(20_000);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void (async () => {
      try {
        await assertPublicTarget(request.url());
        const resource = request.resourceType();
        if (["media", "font"].includes(resource)) await request.abort();
        else await request.continue();
      } catch {
        await request.abort().catch(() => undefined);
      }
    })();
  });
  const runtime: Runtime = { browser, page, hooks: input.hooks, steps: input.steps, credentials: input.credentials, expiresAt: Date.now() + MAX_SESSION_MS, currentStep: 0, lastScreenshotAt: 0 };
  runtimes.set(input.sessionId, runtime);
  void runRuntime(input.sessionId, runtime, input.startUrl, input.allowedUrls);
  return { expiresAt: new Date(runtime.expiresAt) };
}

async function runRuntime(sessionId: number, runtime: Runtime, startUrl: string, allowedUrls: string[]) {
  try {
    const start = allowedUrl(startUrl, startUrl, allowedUrls);
    await assertPublicTarget(start);
    await runtime.page.goto(start, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await runtime.hooks.onEvent({ type: "state", status: "running", currentStep: 0, currentUrl: runtime.page.url(), message: "Authenticated browser session started." });
    await screenshot(runtime);
    for (runtime.currentStep = 0; runtime.currentStep < runtime.steps.length; runtime.currentStep += 1) {
      const step = runtime.steps[runtime.currentStep];
      const label = stepLabel(step);
      await runtime.hooks.onEvent({ type: "state", status: "running", currentStep: runtime.currentStep, currentUrl: runtime.page.url(), message: `Executing step ${runtime.currentStep + 1} of ${runtime.steps.length}.` });
      await runtime.hooks.onEvent({ type: "step", stepIndex: runtime.currentStep, stepType: step.type, status: "started", label, url: runtime.page.url(), detail: `Step ${runtime.currentStep + 1} started.` });
      try {
        await executeStep(runtime, step, startUrl, allowedUrls);
        await runtime.hooks.onEvent({ type: "step", stepIndex: runtime.currentStep, stepType: step.type, status: "succeeded", label, url: runtime.page.url(), detail: `Step ${runtime.currentStep + 1} completed successfully.`, evidence: await sanitizedEvidence(runtime, step) });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Step failed.";
        await runtime.hooks.onEvent({ type: "step", stepIndex: runtime.currentStep, stepType: step.type, status: "failed", label, url: runtime.page.url(), detail: redactedMessage(detail), evidence: await sanitizedEvidence(runtime, step) });
        throw error;
      }
      await screenshot(runtime);
    }
    await runtime.hooks.onEvent({ type: "state", status: "completed", currentStep: runtime.steps.length, currentUrl: runtime.page.url(), message: "Authenticated crawl complete." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authenticated crawl failed.";
    const status = message === "CRAWL_CANCELLED" ? "cancelled" : "failed";
    await runtime.hooks.onEvent({ type: "state", status, currentStep: runtime.currentStep, currentUrl: runtime.page.url(), message: redactedMessage(message) });
  } finally {
    runtime.credentials = { username: "", password: "" };
    runtimes.delete(sessionId);
    await runtime.browser.close().catch(() => undefined);
  }
}

export async function sendTakeoverAction(sessionId: number, action: { type: "click" | "type" | "key" | "resume"; x?: number; y?: number; text?: string; key?: string }) {
  const runtime = runtimes.get(sessionId);
  if (!runtime) throw new Error("The live browser session is no longer available.");
  if (Date.now() > runtime.expiresAt) throw new Error("The live browser session expired.");
  if (action.type === "click") {
    if (action.x === undefined || action.y === undefined) throw new Error("Click coordinates are required.");
    await runtime.page.mouse.click(Math.max(0, Math.min(action.x, 1365)), Math.max(0, Math.min(action.y, 860)));
  } else if (action.type === "type") {
    if (!action.text || action.text.length > 500) throw new Error("Takeover text is empty or too long.");
    await runtime.page.keyboard.type(action.text);
  } else if (action.type === "key") {
    if (!action.key || action.key.length > 20) throw new Error("A keyboard key is required.");
    await runtime.page.keyboard.press(action.key as Parameters<Page["keyboard"]["press"]>[0]);
  } else {
    runtime.takeoverResolver?.();
    runtime.takeoverResolver = undefined;
    runtime.takeoverRejecter = undefined;
  }
  await screenshot(runtime);
}

export async function cancelCrawlRuntime(sessionId: number) {
  const runtime = runtimes.get(sessionId);
  if (!runtime) return;
  runtime.takeoverRejecter?.(new Error("CRAWL_CANCELLED"));
  await runtime.browser.close().catch(() => undefined);
}

export function getCrawlRuntime(sessionId: number) {
  return runtimes.get(sessionId);
}
