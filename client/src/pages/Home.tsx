import { useEffect, useMemo, useState } from "react";
import type { ViewName } from "../App";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clipboard,
  CloudUpload,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  Info,
  Link2,
  Loader2,
  LockKeyhole,
  Minus,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  TriangleAlert,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeScanUrl } from "@/lib/scan-validation";
import { formatFindingId, formatReportId } from "@shared/report-format";

interface HomeProps {
  view: ViewName;
  onViewChange: (view: ViewName) => void;
}

function ScoreRing({ score, small = false }: { score: number; small?: boolean }) {
  const radius = small ? 34 : 57;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  return <div className={`score-ring ${small ? "score-ring-small" : ""}`} style={{ "--circumference": circumference, "--dash": dash } as React.CSSProperties}>
    <svg viewBox="0 0 144 144" aria-hidden="true"><circle className="ring-track" cx="72" cy="72" r={radius} /><circle className="ring-value" cx="72" cy="72" r={radius} /></svg>
    <div className="score-ring-copy"><strong>{score}</strong><span>/ 100</span></div>
  </div>;
}

function ScanView({ onViewChange }: { onViewChange: (view: ViewName) => void }) {
  const [mode, setMode] = useState<"single" | "crawl">("single");
  const [target, setTarget] = useState("");
  const [urlError, setUrlError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [scanJobId, setScanJobId] = useState<number | null>(null);
  const [crawlSessionId, setCrawlSessionId] = useState<number | null>(null);
  const [crawlUsername, setCrawlUsername] = useState("");
  const [crawlPassword, setCrawlPassword] = useState("");
  const [crawlAllowedUrls, setCrawlAllowedUrls] = useState("");
  const [crawlSteps, setCrawlSteps] = useState('[{"type":"open","url":"https://example.com/"},{"type":"fill","selector":"input[name=\\"username\\"]","credential":"username"},{"type":"fill","selector":"input[name=\\"password\\"]","credential":"password"},{"type":"click","selector":"button[type=\\"submit\\"]"},{"type":"mfa_checkpoint","label":"Complete MFA if prompted"},{"type":"scan_page"}]');
  const [crawlFrame, setCrawlFrame] = useState<string | null>(null);
  const [crawlTakeoverText, setCrawlTakeoverText] = useState("");
  const [crawlHistoryFilter, setCrawlHistoryFilter] = useState<"all" | "succeeded" | "failed" | "waiting">("all");
  const [expandedCrawlEvidence, setExpandedCrawlEvidence] = useState<number | null>(null);
  const createScan = trpc.scans.create.useMutation();
  const createCrawl = trpc.scans.createCrawl.useMutation();
  const createDocument = trpc.scans.createDocument.useMutation();
  const pauseScan = trpc.scans.pause.useMutation();
  const resumeScan = trpc.scans.resume.useMutation();
  const cancelScan = trpc.scans.cancel.useMutation();
  const crawlSessionQuery = trpc.scans.crawlSession.useQuery({ scanJobId: scanJobId ?? 0 }, { enabled: mode === "crawl" && scanJobId !== null, refetchInterval: scanning ? 1000 : false });
  const crawlEventsQuery = trpc.scans.crawlEvents.useQuery({ sessionId: crawlSessionId ?? 0 }, { enabled: crawlSessionId !== null, refetchInterval: scanning ? 1000 : false });
  const crawlHistoryQuery = trpc.scans.crawlHistory.useQuery({ sessionId: crawlSessionId ?? 0 }, { enabled: crawlSessionId !== null, refetchInterval: scanning ? 1000 : false });
  const crawlInput = trpc.scans.crawlInput.useMutation();
  const scanQuery = trpc.scans.get.useQuery({ id: scanJobId ?? 0 }, {
    enabled: scanJobId !== null,
    refetchInterval: scanning ? 1000 : false,
  });
  const eventsQuery = trpc.scans.events.useQuery({ id: scanJobId ?? 0 }, {
    enabled: scanJobId !== null,
    refetchInterval: scanning ? 1000 : false,
  });
  const consoleRows = (mode === "crawl" ? crawlEventsQuery.data?.map((event) => ({ ...event, createdAt: event.createdAt })) : eventsQuery.data)?.map((event) => {
    const time = new Date(event.createdAt).toLocaleTimeString([], { hour12: false });
    const state = event.stage === "cancelled" ? "done" : ("progress" in event && event.progress >= 100) || ("status" in event && ["completed", "failed", "cancelled"].includes(String(event.status))) ? "done" : scanning ? "active" : "pending";
    return [time, event.stage.toUpperCase(), mode === "crawl" ? "BROWSER" : "ENGINE", event.message, state] as const;
  }) ?? [];

  const legacyConsoleRows = eventsQuery.data?.map((event) => {
    const time = new Date(event.createdAt).toLocaleTimeString([], { hour12: false });
    const state = event.stage === "cancelled" ? "done" : event.progress >= 100 ? "done" : scanning ? "active" : "pending";
    return [time, event.stage.toUpperCase(), "ENGINE", event.message, state] as const;
  }) ?? [];
  const visibleCrawlHistory = (crawlHistoryQuery.data ?? []).filter((entry) => crawlHistoryFilter === "all" || entry.status === crawlHistoryFilter);

  useEffect(() => {
    if (!retryUntil) {
      setRetrySeconds(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (remaining === 0) setRetryUntil(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const lifecycleBusy = pauseScan.isPending || resumeScan.isPending || cancelScan.isPending;
  const isPaused = scanQuery.data?.status === "paused";
  const isCancelled = scanQuery.data?.status === "cancelled";
  const consoleStatus = isPaused ? "Scan paused" : isCancelled ? "Scan cancelled" : scanning ? "Scan in progress" : "Scan complete";

  const handlePause = async () => {
    if (!scanJobId || lifecycleBusy) return;
    try {
      await pauseScan.mutateAsync({ id: scanJobId });
      await Promise.all([scanQuery.refetch(), eventsQuery.refetch()]);
      toast.success("Scan paused", { description: "AURA will hold execution at the next safe checkpoint." });
    } catch (error) {
      toast.error("Could not pause scan", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const handleResume = async () => {
    if (!scanJobId || lifecycleBusy) return;
    try {
      await resumeScan.mutateAsync({ id: scanJobId });
      await Promise.all([scanQuery.refetch(), eventsQuery.refetch()]);
      toast.success("Scan resumed", { description: "AURA is continuing from the last safe checkpoint." });
    } catch (error) {
      toast.error("Could not resume scan", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const handleCancel = async () => {
    if (!scanJobId || lifecycleBusy) return;
    if (!window.confirm("Cancel this scan? Any findings collected so far will remain available in the execution log.")) return;
    try {
      await cancelScan.mutateAsync({ id: scanJobId });
      setScanning(false);
      await Promise.all([scanQuery.refetch(), eventsQuery.refetch()]);
      toast.success("Scan cancelled", { description: "The execution console has retained the scan telemetry." });
    } catch (error) {
      toast.error("Could not cancel scan", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  useEffect(() => {
    if (mode !== "crawl" || crawlSessionId === null || !scanning) return;
    const source = new EventSource(`/api/crawls/${crawlSessionId}/events`);
    source.addEventListener("screenshot", (event) => {
      try { setCrawlFrame((JSON.parse((event as MessageEvent).data) as { dataUrl?: string }).dataUrl ?? null); } catch { /* ignore malformed telemetry */ }
    });
    source.addEventListener("state", () => { void crawlSessionQuery.refetch(); void scanQuery.refetch(); });
    source.addEventListener("step", () => { void crawlHistoryQuery.refetch(); void crawlEventsQuery.refetch(); });
    source.onerror = () => source.close();
    return () => source.close();
  }, [mode, crawlSessionId, scanning, crawlSessionQuery.refetch, crawlHistoryQuery.refetch, crawlEventsQuery.refetch, scanQuery.refetch]);

  useEffect(() => {
    if (scanJobId === null || !scanning || mode === "crawl") return;
    const source = new EventSource(`/api/scans/${scanJobId}/events`);
    source.addEventListener("scan", () => void scanQuery.refetch());
    source.addEventListener("complete", () => {
      void scanQuery.refetch();
      source.close();
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [scanJobId, scanning, scanQuery.refetch]);

  useEffect(() => {
    const job = scanQuery.data;
    if (!job) return;
    if (job.status === "completed") {
      setScanning(false);
      toast.success("Scan complete", { description: "Your evidence-backed report is ready to review." });
      onViewChange("report");
    }
    if (job.status === "failed") {
      setScanning(false);
      toast.error("Scan failed", { description: job.errorMessage ?? "AURA could not complete this scan." });
    }
    if (job.status === "cancelled") {
      setScanning(false);
    }
  }, [scanQuery.data, onViewChange]);

  const sendCrawlInput = async (action: { type: "click"; x: number; y: number } | { type: "type"; text: string } | { type: "key"; key: string } | { type: "resume" }) => {
    if (!crawlSessionId || crawlInput.isPending) return;
    try {
      await crawlInput.mutateAsync({ sessionId: crawlSessionId, action });
      await crawlSessionQuery.refetch();
    } catch (error) {
      toast.error("Takeover action failed", { description: error instanceof Error ? error.message : "Try again." });
    }
  };

  const beginScan = async () => {
    if (retrySeconds > 0) {
      toast.info("Scan temporarily paused", { description: `Try again in about ${retrySeconds} seconds.` });
      return;
    }
    const normalized = normalizeScanUrl(target);
    if (!normalized.ok) {
      setUrlError(normalized.message);
      toast.error("Invalid URL", { description: normalized.message });
      return;
    }
    setUrlError("");
    try {
      setScanning(true);
      setConsoleOpen(true);
      if (mode === "crawl") {
        try {
          const allowedUrls = (crawlAllowedUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).length ? crawlAllowedUrls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) : [normalized.value]);
          const parsedSteps = JSON.parse(crawlSteps) as unknown;
          if (!Array.isArray(parsedSteps) || parsedSteps.length === 0) throw new Error("Add at least one valid crawl step in JSON format.");
          const result = await createCrawl.mutateAsync({ startUrl: normalized.value, allowedUrls, steps: parsedSteps as never, credentials: { username: crawlUsername, password: crawlPassword } });
          setScanJobId(result.job.id);
          setCrawlSessionId(result.session.id);
          setCrawlPassword("");
          toast.success("Authenticated crawl queued", { description: "AURA is opening a time-limited isolated browser session." });
        } catch (error) {
          setScanning(false);
          throw error;
        }
      } else {
        const job = await createScan.mutateAsync({ targetUrl: normalized.value, scanType: "url" });
        setScanJobId(job.id);
        toast.success("Scan queued", { description: "AURA is preparing the accessibility engine." });
      }
    } catch (error) {
      setScanning(false);
      const message = error instanceof Error ? error.message : "Check the URL and try again.";
      if (message.includes("Scan limit reached")) {
        setRetryUntil(Date.now() + 60_000);
        toast.error("Scan limit reached", { description: "AURA protects the public scanner with a five-scan-per-minute limit. Try again in about 60 seconds." });
      } else {
        toast.error("Could not start scan", { description: message });
      }
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (retrySeconds > 0) {
      toast.info("Scan temporarily paused", { description: `Try again in about ${retrySeconds} seconds.` });
      return;
    }
    if (!file) return;
    setFileName(file.name);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });
      setScanning(true);
      setConsoleOpen(true);
      const job = await createDocument.mutateAsync({ filename: file.name, mimeType: file.type, contentBase64 });
      setScanJobId(job.id);
      toast.success("Document scan queued", { description: `${file.name} is being analyzed by AURA.` });
    } catch (error) {
      setScanning(false);
      const message = error instanceof Error ? error.message : "Check the selected file and try again.";
      if (message.includes("Scan limit reached")) {
        setRetryUntil(Date.now() + 60_000);
        toast.error("Scan limit reached", { description: "AURA protects the public scanner with a five-scan-per-minute limit. Try again in about 60 seconds." });
      } else {
        toast.error("Could not start document scan", { description: message });
      }
    }
  };

  const displayRows = mode === "crawl" ? consoleRows : legacyConsoleRows;
  const isExecutionVisible = scanJobId !== null;

  return <div className="aura-page aura-scan-page">
    <section className="scan-command-card">
      <div className="scan-card-header"><div><div className="section-kicker">01 / TARGET</div><h2>What do you want to scan?</h2><p className="scan-card-description">Start an evidence-backed accessibility run for a live URL or uploaded document.</p></div><div className="standard-badge"><ShieldAlert size={14} /> WCAG 2.1 AA <ChevronDown size={14} /></div></div>
      <div className="scan-tabs" role="tablist" aria-label="Scan type">
        <button className={mode === "single" ? "is-selected" : ""} onClick={() => setMode("single")} role="tab" aria-selected={mode === "single"}><Link2 size={15} /> URL scan <span className="tab-note">recommended</span></button>
        <button className={mode === "crawl" ? "is-selected" : ""} onClick={() => setMode("crawl")} role="tab" aria-selected={mode === "crawl"}><RefreshCw size={15} /> Website crawl</button>
        <button className="scan-file-tab" onClick={() => document.getElementById("aura-file-upload")?.click()}><Upload size={15} /> Upload file</button>
      </div>
      <div className="target-input-row"><div className="target-input-wrap"><div className="input-prefix"><ExternalLink size={15} /></div><input aria-label="URL to scan" value={target} onChange={(e) => { setTarget(e.target.value); if (urlError) setUrlError(""); }} placeholder="Enter a URL to scan…" aria-invalid={Boolean(urlError)} aria-describedby={urlError ? "url-scan-error" : undefined} /><button className="clear-input" aria-label="Clear URL" onClick={() => { setTarget(""); setUrlError(""); }}><X size={15} /></button></div><button className="primary-action" onClick={beginScan} disabled={scanning || retrySeconds > 0} title={retrySeconds > 0 ? `Try again in about ${retrySeconds} seconds` : undefined}><span>{scanning ? "Scanning" : retrySeconds > 0 ? `Retry in ${retrySeconds}s` : "Start scan"}</span>{scanning ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}</button></div>{urlError && <p id="url-scan-error" className="field-error" role="alert">{urlError}</p>}
      {mode === "crawl" && <div className="crawl-auth-config">
        <div className="crawl-config-heading"><div><span className="section-kicker">AUTHENTICATED WORKFLOW</span><h3>Manual browser steps</h3><p>Credentials are used for this one-time session only, retained in memory until completion, cancellation, or expiry, and never saved in reports or telemetry. Use an <code>mfa_checkpoint</code> step to open live takeover.</p></div><span className="workflow-pill"><LockKeyhole size={13} /> 15 min session</span></div>
        <div className="crawl-credentials"><label>Username<input value={crawlUsername} onChange={(event) => setCrawlUsername(event.target.value)} autoComplete="off" placeholder="name@example.com" /></label><label>Password<input type="password" value={crawlPassword} onChange={(event) => setCrawlPassword(event.target.value)} autoComplete="off" placeholder="One-time password" /></label></div>
        <label>Approved URLs <textarea value={crawlAllowedUrls} onChange={(event) => setCrawlAllowedUrls(event.target.value)} placeholder={`${target || "https://example.com/"}\nhttps://example.com/account`} rows={2} /></label>
        <label>Step definition JSON <textarea value={crawlSteps} onChange={(event) => setCrawlSteps(event.target.value)} rows={6} spellCheck={false} /></label>
        <p className="crawl-security-note"><ShieldAlert size={14} /> Same-origin only. AURA will block unapproved navigation, CAPTCHA bypass, cross-origin steps, and sessions beyond the time limit.</p>
      </div>}
      {mode === "crawl" && <div className="crawl-settings"><label>Max pages<input defaultValue="20" type="number" disabled /></label><label>Max depth<input defaultValue="1" type="number" disabled /></label><label className="toggle-label">Explicit URLs only <span className="fake-toggle is-on"><span /></span></label><label className="toggle-label">Same-origin only <span className="fake-toggle is-on"><span /></span></label></div>}
      <div className="dropzone"><input id="aura-file-upload" type="file" aria-label="Choose document to scan" onChange={handleFile} disabled={retrySeconds > 0 || scanning} accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.json,.html,.txt,.xml,.md,.ppt,.pptx" className="dropzone-file-input" /><div className="dropzone-icon"><CloudUpload size={20} /></div><div><strong>{fileName || "Drop a file here or browse from your computer"}</strong><span>Supported formats: PDF, DOCX, XLSX, CSV, JSON, HTML, PPTX and more</span></div><span className="browse-files">Browse files <ArrowRight size={14} /></span></div>
    </section>

    {isExecutionVisible && <section className={`console-card ${consoleOpen ? "is-open" : "is-collapsed"}`} aria-live="polite"><div className="console-header"><div><div className="section-kicker console-kicker">AURA EXECUTION CONSOLE</div><h2><Terminal size={17} /> Runtime telemetry</h2></div><div className="console-actions">{scanning && (isPaused ? <button aria-label="Resume scan" title="Resume scan" onClick={handleResume} disabled={lifecycleBusy}><Play size={14} /> Resume</button> : <button aria-label="Pause scan" title="Pause scan" onClick={handlePause} disabled={lifecycleBusy}><Pause size={14} /> Pause</button>)}{scanning && <button aria-label="Cancel scan" title="Cancel scan" onClick={handleCancel} disabled={lifecycleBusy}><X size={14} /> Cancel</button>}<button aria-label="Copy logs" onClick={() => { navigator.clipboard?.writeText(displayRows.map((row) => row.join(" ")).join("\n")); toast.success("Logs copied"); }}><Copy size={14} /></button><button aria-label="Download logs" onClick={() => toast.success("Log export ready")}><Download size={14} /></button><button aria-label={consoleOpen ? "Collapse console" : "Expand console"} onClick={() => setConsoleOpen(!consoleOpen)}>{consoleOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></div></div>{consoleOpen && <><div className="console-progress"><div className="progress-label"><span><span className="progress-dot" /> {consoleStatus}</span><strong>{isCancelled ? "Stopped" : isPaused ? `${scanQuery.data?.progress ?? 0}%` : scanning ? `${scanQuery.data?.progress ?? 0}%` : "Complete"}</strong></div><div className="progress-track"><span style={{ width: `${scanning ? (scanQuery.data?.progress ?? 0) : 100}%` }} /></div></div><div className="console-body">{displayRows.length === 0 ? <div className="console-empty">Waiting for the first execution event…</div> : displayRows.map(([time, level, component, action, state], index) => <div className={`console-line ${state}`} key={`${time}-${index}`}><span className="console-time">[{time}]</span><span className={`console-level level-${level.toLowerCase()}`}>{level}</span><span className="console-component">{component}</span><span className="console-action">{action}</span>{state === "done" && <Check size={12} className="console-check" />}{state === "active" && <span className="console-cursor" />}</div>)}</div>{mode === "crawl" && <section className="crawl-history" aria-label="Manual crawl step history"><div className="crawl-history-header"><div><span className="section-kicker">STEP HISTORY</span><h3>Manual crawl history</h3><p>Each action is recorded with redacted context so you can see exactly where the authenticated workflow succeeded or stopped.</p></div><div className="crawl-history-filters" role="group" aria-label="Filter crawl history">{([['all','All'],['succeeded','Success'],['failed','Failed'],['waiting','Waiting']] as const).map(([value, label]) => <button key={value} className={crawlHistoryFilter === value ? "is-selected" : ""} onClick={() => setCrawlHistoryFilter(value)}>{label}</button>)}</div></div>{visibleCrawlHistory.length === 0 ? <div className="crawl-history-empty">{crawlSessionId ? "No manual step history yet. AURA will record each step as it executes." : "Start an authenticated crawl to see step history."}</div> : <div className="crawl-history-list">{visibleCrawlHistory.map((entry) => <article className={`crawl-history-entry is-${entry.status}`} key={entry.id}><div className="crawl-history-marker" aria-hidden="true">{entry.status === "succeeded" ? <Check size={13} /> : entry.status === "failed" ? <X size={13} /> : entry.status === "waiting" ? <Pause size={13} /> : <Loader2 size={13} className="spin" />}</div><div className="crawl-history-main"><div className="crawl-history-line"><strong>Step {entry.stepIndex + 1} · {entry.label}</strong><span className={`crawl-history-status status-${entry.status}`}>{entry.status}</span></div><div className="crawl-history-meta"><span>{new Date(entry.createdAt).toLocaleTimeString([], { hour12: false })}</span>{entry.url && <span className="mono">{entry.url}</span>}<span>{entry.stepType}</span></div>{entry.detail && <p>{entry.detail}</p>}{(entry.screenshotUrl || entry.selector || entry.selectorMetadataJson || entry.domSnippet) && <><button className="crawl-evidence-toggle" type="button" aria-expanded={expandedCrawlEvidence === entry.id} onClick={() => setExpandedCrawlEvidence(expandedCrawlEvidence === entry.id ? null : entry.id)}>{expandedCrawlEvidence === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {expandedCrawlEvidence === entry.id ? "Hide step evidence" : "Show step evidence"}</button>{expandedCrawlEvidence === entry.id && <div className="crawl-step-evidence"><div className="crawl-evidence-grid">{entry.screenshotUrl && <figure className="crawl-evidence-shot"><img src={entry.screenshotUrl} alt={`Sanitized screenshot for step ${entry.stepIndex + 1}`} loading="lazy" /><figcaption>Sanitized browser state · credentials redacted</figcaption></figure>}<div className="crawl-evidence-facts">{entry.selector && <div><span>Selector</span><code>{entry.selector}</code></div>}{entry.selectorMetadataJson && <div><span>Selector metadata</span><pre>{entry.selectorMetadataJson}</pre></div>}{entry.domSnippet && <div className="crawl-evidence-dom"><span>Sanitized DOM snippet</span><pre aria-label={`Sanitized DOM snippet for step ${entry.stepIndex + 1}`}>{entry.domSnippet}</pre></div>}{!entry.screenshotUrl && !entry.selector && !entry.selectorMetadataJson && !entry.domSnippet && <p>No additional evidence was persisted for this step.</p>}</div></div></div>}</>}</div></article>)}</div>}</section>}{mode === "crawl" && crawlSessionQuery.data?.session.status === "takeover" && <div className="crawl-takeover"><div className="crawl-takeover-header"><div><span className="section-kicker">LIVE TAKEOVER</span><h3>Complete MFA in the isolated browser</h3><p>AURA has paused the step runner. Click or type only what is required, then resume.</p></div><button className="primary-action" onClick={() => void sendCrawlInput({ type: "resume" })} disabled={crawlInput.isPending}><Play size={14} /> Resume crawl</button></div>{crawlFrame ? <div className="crawl-browser-frame"><img src={crawlFrame} alt="Live isolated browser session" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); void sendCrawlInput({ type: "click", x: ((event.clientX - rect.left) / rect.width) * 1365, y: ((event.clientY - rect.top) / rect.height) * 860 }); }} /><span className="crawl-frame-label">LIVE / REDACTED TELEMETRY</span></div> : <div className="console-empty">Waiting for the live browser frame…</div>}<div className="crawl-takeover-input"><input value={crawlTakeoverText} onChange={(event) => setCrawlTakeoverText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && crawlTakeoverText) { void sendCrawlInput({ type: "type", text: crawlTakeoverText }); setCrawlTakeoverText(""); } }} placeholder="Type into the live browser, then press Enter" /><button onClick={() => { if (crawlTakeoverText) { void sendCrawlInput({ type: "type", text: crawlTakeoverText }); setCrawlTakeoverText(""); } }} disabled={!crawlTakeoverText || crawlInput.isPending}><ArrowRight size={15} /></button><button onClick={() => void sendCrawlInput({ type: "key", key: "Enter" })} disabled={crawlInput.isPending}>Enter</button></div></div>}{consoleOpen && <div className="console-footer"><span>Browser runtime: development-capable / Autoscale release gate</span><span>{crawlSessionQuery.data?.session.expiresAt ? `Expires ${new Date(crawlSessionQuery.data.session.expiresAt).toLocaleTimeString()}` : ""}</span></div>}</>}</section>}
  </div>;
}

function reportPrinciple(ruleId: string) {
  const prefix = ruleId.match(/(?:WCAG[- ]?)?(1|2|3|4)(?:\.|$)/i)?.[1];
  return prefix === "1" ? "Perceivable" : prefix === "2" ? "Operable" : prefix === "3" ? "Understandable" : prefix === "4" ? "Robust" : "WCAG";
}

function reportCriterion(ruleId: string) {
  return ruleId.match(/(\d+\.\d+\.\d+)/)?.[1] ?? ruleId;
}

function reportRisk(severity: string) {
  return severity === "critical" || severity === "serious" ? "High" : severity === "moderate" ? "Medium" : "Low";
}

const findingStatusLabels = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  verified: "Verified",
  closed: "Closed",
} as const;

const findingStatusOrder = ["open", "acknowledged", "in_progress", "verified", "closed"] as const;
type FindingStatus = typeof findingStatusOrder[number];
const allowedFindingTransitions: Record<FindingStatus, FindingStatus[]> = {
  open: ["open", "acknowledged"],
  acknowledged: ["acknowledged", "open", "in_progress"],
  in_progress: ["in_progress", "acknowledged", "verified"],
  verified: ["verified", "in_progress", "closed"],
  closed: ["closed", "verified"],
};

function ReportView() {
  const [filter, setFilter] = useState("All issues");
  const [workflowFilter, setWorkflowFilter] = useState("All statuses");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"executive" | "findings" | "wcag" | "ada">("executive");
  const [expanded, setExpanded] = useState<number | null>(0);
  const [exporting, setExporting] = useState<"pdf" | "json" | null>(null);
  const scansQuery = trpc.scans.list.useQuery();
  const reportsQuery = trpc.scans.reports.useQuery();
  const latestJob = scansQuery.data?.[0];
  const latestReport = reportsQuery.data?.find((item) => item.job.id === latestJob?.id)?.report;
  const detailQuery = trpc.scans.reportDetail.useQuery({ id: latestReport?.id ?? 0 }, { enabled: Boolean(latestReport?.id) });
  const detail = detailQuery.data;
  const findings = detail?.findings ?? [];
  const crawlPages = detail?.pages ?? [];
  const updateFindingStatus = trpc.scans.updateFindingStatus.useMutation({
    onSuccess: async () => {
      await detailQuery.refetch();
      toast.success("Finding status updated");
    },
    onError: (error) => toast.error("Could not update finding status", { description: error.message }),
  });
  const score = detail?.report.score ?? latestJob?.score ?? 0;
  const source = detail?.document?.filename ?? detail?.job.targetUrl ?? "No persisted report selected";
  const count = (severity: string) => findings.filter((finding) => finding.severity === severity).length;
  const total = findings.length;
  const rows = findings.map((finding, index) => ({
    id: formatFindingId(latestJob?.id ?? 0, index),
    findingId: finding.id,
    workflowStatus: (finding.workflow?.status ?? "open") as FindingStatus,
    rule: `${finding.ruleId} ${finding.title}`,
    criterion: reportCriterion(finding.ruleId),
    principle: reportPrinciple(finding.ruleId),
    selector: finding.selector ?? "Document-level finding",
    severity: finding.severity[0].toUpperCase() + finding.severity.slice(1),
    risk: reportRisk(finding.severity),
    description: finding.description,
    evidence: finding.evidence ?? "No raw evidence was stored for this finding.",
    remediation: finding.remediation ?? "Review the evidence and apply the recommended remediation.",
    verification: "Re-run AURA and manually verify the affected interaction with keyboard navigation and assistive technology.",
  }));
  const visibleRows = rows.filter((row) => (filter === "All issues" || row.severity === filter) && (workflowFilter === "All statuses" || row.workflowStatus === workflowFilter) && `${row.rule} ${row.selector} ${row.criterion}`.toLowerCase().includes(search.toLowerCase()));
  const updateStatus = async (findingId: number, status: FindingStatus) => {
    await updateFindingStatus.mutateAsync({ findingId, status });
  };
  const matrix = Object.values(rows.reduce<Record<string, { criterion: string; principle: string; issues: number; severity: string }>>((acc, row) => {
    const key = `${row.criterion}-${row.principle}`;
    acc[key] ??= { criterion: row.criterion, principle: row.principle, issues: 0, severity: row.severity };
    acc[key].issues += 1;
    return acc;
  }, {}));
  const exportReport = async (format: "pdf" | "json") => {
    if (!latestReport?.id || exporting) return;
    setExporting(format);
    try {
      const response = await fetch(`/api/reports/${latestReport.id}/export.${format}`, { credentials: "include" });
      if (!response.ok) throw new Error("The report could not be exported.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${formatReportId(latestReport.id)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      toast.success(`${format.toUpperCase()} report downloaded`);
    } catch (error) {
      toast.error(`${format.toUpperCase()} export failed`, { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setExporting(null);
    }
  };
  const tabs = [["executive", "Executive"], ["findings", "Findings"], ["wcag", "WCAG 2.1 AA"], ["ada", "ADA readiness"]] as const;
  return <div className="aura-page aura-report-page">
    <section className="report-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> ACCESSIBILITY ASSESSMENT</div><h1>{detail?.report.title ?? source}</h1><p><span className="mono">{source}</span><span className="dot-separator">·</span>{latestReport ? formatReportId(latestReport.id) : "Awaiting persisted report"}<span className="dot-separator">·</span>{detail?.job.completedAt ? `Scan completed ${new Date(detail.job.completedAt).toLocaleString()}` : "Awaiting completion"}</p></div><div className="report-heading-actions"><button className="secondary-action" onClick={() => void exportReport("json")} disabled={!latestReport?.id || Boolean(exporting)}>{exporting === "json" ? "Preparing" : "JSON"}</button><button className="primary-action compact" onClick={() => void exportReport("pdf")} disabled={!latestReport?.id || Boolean(exporting)}>{exporting === "pdf" ? "Preparing" : "PDF"}</button></div></section>
    <section className="report-meta-strip"><div><span>Standard</span><strong>WCAG 2.1 AA</strong></div><div><span>Assessment type</span><strong>Automated accessibility assessment</strong></div><div><span>Source</span><strong className="mono">{source}</strong></div><div><span>Findings</span><strong>{total}</strong></div></section>
    <nav className="report-tabs" aria-label="Report sections">{tabs.map(([value, label]) => <button key={value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {(tab === "executive" || tab === "ada") && <section className="report-overview-grid report-modern-grid"><div className="score-card"><div className="card-topline"><div><div className="section-kicker">AURA ACCESSIBILITY HEALTH SCORE</div><h2>Automated health indicator <span className="info-tip" title="This is an aggregated automated finding indicator, not an official WCAG conformance percentage."><Info size={14} /></span></h2></div><div className="score-status"><span className={`status-dot ${total ? "is-warn" : ""}`} /> {total ? "Needs improvement" : "No recorded issues"}</div></div><div className="score-card-main"><ScoreRing score={score} /><div className="score-explanation"><strong>{score} / 100</strong><p>This aggregated indicator reflects persisted automated findings. Manual accessibility evaluation is still required.</p></div></div><div className="score-footnote"><span><Gauge size={14} /> Not a conformance percentage</span><span><FileCheck2 size={14} /> {total} persisted findings</span></div></div><div className="severity-card"><div className="card-topline"><div><div className="section-kicker">SCORE BREAKDOWN</div><h2>Potential accessibility barriers</h2></div><span className="issue-total">{total} total</span></div><div className="severity-bars">{[["Critical", count("critical"), "critical"], ["Serious", count("serious"), "serious"], ["Moderate", count("moderate"), "moderate"], ["Minor", count("minor"), "minor"]].map(([label, value, className]) => <div className="severity-row" key={String(label)}><span className={`severity-icon ${className}`}><AlertTriangle size={12} /></span><span className="severity-label">{label}</span><div className="severity-track"><span className={String(className)} style={{ width: `${Math.max(Number(value) * 11, Number(value) ? 8 : 0)}%` }} /></div><strong>{value}</strong></div>)}</div><div className="severity-card-footer"><span><CheckCircle2 size={14} /> {total ? "Manual review required" : "No persisted violations"}</span><span>Passed checks: not captured</span></div></div></section>}
    {tab === "executive" && <><section className="dual-report-cards"><div className="report-panel"><div className="section-kicker">WCAG 2.1 AA ASSESSMENT</div><h2>Partially conformant — automated assessment</h2><p>Automated assessment identified potential accessibility barriers affecting WCAG 2.1 AA success criteria. This result does not establish conformance.</p><div className="assessment-stat-grid"><div><strong>{total ? 0 : 1}</strong><span>Passed automated checks</span></div><div><strong>{total}</strong><span>Findings requiring action</span></div><div><strong>—</strong><span>Manual review required</span></div></div></div><div className="report-panel ada-panel"><div className="section-kicker">ADA ACCESSIBILITY READINESS</div><div className="ada-score"><strong>{score} / 100</strong><span>{total ? "Action recommended" : "No automated barriers recorded"}</span></div><p>Automated findings indicate potential barriers relevant to ADA-oriented digital accessibility expectations. Legal and manual accessibility evaluation may be required.</p><small>ADA is a legal framework rather than a technical testing specification. This indicator is not legal compliance certification.</small></div></section><section className="report-panel"><div className="section-kicker">REPORT SOURCE</div><h2>Persisted evidence reviewed</h2><div className="source-facts"><div><span>Target</span><strong className="mono">{detail?.job.targetUrl ?? "—"}</strong></div><div><span>Scan status</span><strong>{detail?.job.status ?? "—"}</strong></div><div><span>Completed</span><strong>{detail?.job.completedAt ? new Date(detail.job.completedAt).toLocaleString() : "—"}</strong></div><div><span>Evidence</span><strong>{detail?.document ? `${detail.document.byteSize} bytes stored` : "Persisted scan findings"}</strong></div></div></section>{detail?.job.scanType === "crawl" && <section className="report-panel crawl-coverage-panel"><div className="section-kicker">CRAWL PAGE COVERAGE</div><div className="crawl-coverage-heading"><div><h2>Persisted pages reviewed</h2><p>Every page below was captured by the authenticated crawl session and linked to this report.</p></div><span className="issue-total">{crawlPages.length} page{crawlPages.length === 1 ? "" : "s"}</span></div>{crawlPages.length === 0 ? <div className="report-empty-state"><CheckCircle2 size={18} /><strong>No page coverage recorded</strong><p>The crawl did not persist a completed page capture.</p></div> : <div className="crawl-page-list">{crawlPages.map((page) => <div className="crawl-page-row" key={page.id}><div><strong>{page.title || page.url}</strong><span className="mono">{page.url}</span></div><span className={`workflow-pill workflow-${page.findingCount > 0 ? "open" : "verified"}`}><span /> {page.findingCount} finding{page.findingCount === 1 ? "" : "s"}</span><strong>{page.score ?? "—"}</strong></div>)}</div>}</section>}</>}
    {(tab === "findings" || tab === "executive") && <section className="violations-section"><div className="violations-header"><div><div className="section-kicker">ISSUE QUEUE / PERSISTED FINDINGS</div><h2>Accessibility errors</h2><p>Each issue includes the evidence, impact, remediation, and verification guidance persisted for this scan.</p></div><div className="violation-tools"><div className="report-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issues…" aria-label="Search accessibility issues" /></div><select className="severity-filter" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter issue severity"><option>All issues</option><option>Critical</option><option>Serious</option><option>Moderate</option><option>Minor</option></select><select className="severity-filter" value={workflowFilter} onChange={(event) => setWorkflowFilter(event.target.value)} aria-label="Filter issue workflow status"><option>All statuses</option>{findingStatusOrder.map((status) => <option key={status} value={status}>{findingStatusLabels[status]}</option>)}</select></div></div><div className="violations-table-wrap"><div className="violations-table-head"><span>Rule / selector</span><span>Severity</span><span>Evidence</span><span> </span></div>{visibleRows.length === 0 ? <div className="report-empty-state"><CheckCircle2 size={18} /><strong>{total ? "No matching persisted errors" : "No persisted accessibility errors"}</strong><p>{total ? "Adjust the search or severity filter." : "This report contains no stored findings for the executed scan."}</p></div> : visibleRows.map((row, index) => <div className={`violation-row ${expanded === index ? "is-expanded" : ""}`} key={row.id}><button className="violation-main" onClick={() => setExpanded(expanded === index ? null : index)}><div className="rule-cell"><span className="rule-id">{row.id}</span><strong>{row.rule}</strong><code>{row.selector}</code></div><span className={`severity-pill ${row.severity.toLowerCase()}`}><span /> {row.severity}</span><span className={`workflow-pill workflow-${row.workflowStatus}`}><span /> {findingStatusLabels[row.workflowStatus]}</span><span className="evidence-cell"><Code2 size={14} /> {row.evidence.length > 80 ? `${row.evidence.slice(0, 80)}…` : row.evidence}</span><ChevronRight size={16} className="row-chevron" /></button>{expanded === index && <div className="violation-detail"><div className="finding-workflow-control"><div><span>Workflow state</span><p>Track the remediation lifecycle without changing the immutable scan evidence.</p></div><select value={row.workflowStatus} onChange={(event) => void updateStatus(row.findingId, event.target.value as FindingStatus)} disabled={updateFindingStatus.isPending} aria-label={`Workflow status for ${row.rule}`}>{allowedFindingTransitions[row.workflowStatus].map((status) => <option key={status} value={status}>{findingStatusLabels[status]}</option>)}</select></div><div><span>What is the problem?</span><p>{row.description}</p></div><div><span>WCAG / principle</span><p>{row.criterion} · {row.principle} · {row.risk} risk</p></div><div><span>Affected element / selector</span><pre>{row.selector}</pre></div><div><span>Captured evidence</span><pre>{row.evidence}</pre></div><div><span>Recommended remediation</span><p>{row.remediation}</p></div><div><span>Verification</span><p>{row.verification}</p></div><button className="detail-action" onClick={() => { void navigator.clipboard?.writeText([row.id, row.rule, row.selector, row.description, row.evidence, row.remediation].join("\n")); toast.success("Issue copied to clipboard"); }}>Copy issue <Clipboard size={14} /></button></div>}</div>)}</div></section>}
    {tab === "wcag" && <section className="report-panel"><div className="section-kicker">WCAG 2.1 AA COMPLIANCE MATRIX</div><h2>Success criteria represented by persisted findings</h2><p className="panel-note">Statuses reflect automated evidence only. Manual review is required for criteria that cannot be reliably determined by scanning.</p><div className="matrix-table"><div className="matrix-row matrix-head"><span>Success criterion</span><span>Principle</span><span>Status</span><span>Issues</span><span>Severity</span></div>{matrix.length === 0 ? <div className="report-empty-state"><CheckCircle2 size={18} /><strong>No persisted criteria</strong><p>The report has no stored findings to map into the matrix.</p></div> : matrix.map((item) => <div className="matrix-row" key={`${item.criterion}-${item.principle}`}><span className="mono">{item.criterion}</span><span>{item.principle}</span><span><span className="matrix-status failed">Findings recorded</span></span><span>{item.issues}</span><span>{item.severity}</span></div>)}</div></section>}
    {tab === "ada" && <section className="report-panel"><div className="section-kicker">MANUAL REVIEW REQUIRED</div><h2>Automated testing has limits</h2><p>Some requirements cannot be reliably determined through automated testing, including meaningful alternative text, logical reading order, understandable instructions, accurate captions, intuitive keyboard interaction, and meaningful error recovery.</p><div className="manual-review-callout"><ShieldAlert size={18} /><div><strong>Manual accessibility evaluation required</strong><span>AURA reports potential barriers; it does not certify ADA compliance.</span></div></div></section>}
  </div>;
}

export default function Home({ view, onViewChange }: HomeProps) {
  return view === "scan" ? <ScanView onViewChange={onViewChange} /> : <ReportView />;
}
