import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  getScanJobForUser: vi.fn(),
  getReportForUser: vi.fn(),
  getReportDetailForUser: vi.fn(),
  listFindingsForUser: vi.fn(),
  updateScanJob: vi.fn(),
  addScanEvent: vi.fn(),
  getFindingWorkflowStateForUser: vi.fn(),
  updateFindingWorkflowState: vi.fn(),
  getCrawlSessionForUser: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...dbMocks };
});

import { appRouter } from "./routers";
import { MCP_TOOLS } from "./mcp-api";
import { authenticateMcpToken } from "./mcp-auth";

describe("AURA API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advertises the implemented MCP tool surface", () => {
    expect(MCP_TOOLS.map(tool => tool.name)).toEqual([
      "aura_scan_url",
      "aura_scan_document",
      "aura_get_scan",
      "aura_list_issues",
      "aura_get_report",
      "aura_list_reports",
      "aura_cancel_scan",
    ]);
    expect(MCP_TOOLS.every(tool => tool.inputSchema.type === "object")).toBe(true);
  });

  it("rejects an invalid MCP bearer token", () => {
    expect(authenticateMcpToken("Bearer definitely-invalid")).toBe(false);
  });

  it("does not expose a scan owned by another user", async () => {
    dbMocks.getScanJobForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    await expect(caller.scans.get({ id: 99 })).resolves.toBeUndefined();
    expect(dbMocks.getScanJobForUser).toHaveBeenCalledWith(99, 42);
  });

  it("does not cancel a scan owned by another user", async () => {
    dbMocks.getScanJobForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    await expect(caller.scans.cancel({ id: 99 })).rejects.toThrow("Scan not found.");
    expect(dbMocks.getScanJobForUser).toHaveBeenCalledWith(99, 42);
  });

  it("pauses and resumes an owned running scan", async () => {
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    dbMocks.getScanJobForUser.mockResolvedValue({ id: 11, userId: 42, status: "running", progress: 35 });
    await expect(caller.scans.pause({ id: 11 })).resolves.toMatchObject({ success: true, status: "paused" });
    expect(dbMocks.updateScanJob).toHaveBeenCalledWith(11, { status: "paused" });
    expect(dbMocks.addScanEvent).toHaveBeenCalledWith(expect.objectContaining({ scanJobId: 11, stage: "paused", progress: 35 }));

    dbMocks.getScanJobForUser.mockResolvedValue({ id: 11, userId: 42, status: "paused", progress: 35 });
    await expect(caller.scans.resume({ id: 11 })).resolves.toMatchObject({ success: true, status: "running" });
    expect(dbMocks.updateScanJob).toHaveBeenCalledWith(11, { status: "running" });
    expect(dbMocks.addScanEvent).toHaveBeenCalledWith(expect.objectContaining({ scanJobId: 11, stage: "resumed", progress: 35 }));
  });

  it("cancels an owned scan and rejects foreign lifecycle access", async () => {
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    dbMocks.getScanJobForUser.mockResolvedValue({ id: 12, userId: 42, status: "running", progress: 48 });
    await expect(caller.scans.cancel({ id: 12 })).resolves.toMatchObject({ success: true, status: "cancelled" });
    expect(dbMocks.updateScanJob).toHaveBeenCalledWith(12, expect.objectContaining({ status: "cancelled" }));
    expect(dbMocks.addScanEvent).toHaveBeenCalledWith(expect.objectContaining({ scanJobId: 12, stage: "cancelled", status: "cancelled" }));

    dbMocks.getScanJobForUser.mockResolvedValue(undefined);
    await expect(caller.scans.pause({ id: 13 })).rejects.toThrow("Scan not found.");
    await expect(caller.scans.resume({ id: 13 })).rejects.toThrow("Scan not found.");
    await expect(caller.scans.cancel({ id: 13 })).rejects.toThrow("Scan not found.");
  });

  it("updates an owned finding through an allowed workflow transition", async () => {
    dbMocks.getFindingWorkflowStateForUser.mockResolvedValue({ findingId: 44, status: "acknowledged" });
    dbMocks.updateFindingWorkflowState.mockResolvedValue({ findingId: 44, status: "in_progress", updatedBy: 42 });
    const caller = appRouter.createCaller({ user: { id: 42, openId: "user-42", role: "user" } as never, req: {} as never, res: {} as never });
    await expect(caller.scans.updateFindingStatus({ findingId: 44, status: "in_progress" })).resolves.toMatchObject({ findingId: 44, status: "in_progress" });
    expect(dbMocks.getFindingWorkflowStateForUser).toHaveBeenCalledWith(44, 42);
    expect(dbMocks.updateFindingWorkflowState).toHaveBeenCalledWith({ findingId: 44, userId: 42, status: "in_progress" });
  });

  it("rejects a workflow jump that skips the remediation lifecycle", async () => {
    dbMocks.getFindingWorkflowStateForUser.mockResolvedValue({ findingId: 45, status: "open" });
    const caller = appRouter.createCaller({ user: { id: 42, openId: "user-42", role: "user" } as never, req: {} as never, res: {} as never });
    await expect(caller.scans.updateFindingStatus({ findingId: 45, status: "closed" })).rejects.toThrow("Cannot move a finding from open to closed.");
    expect(dbMocks.updateFindingWorkflowState).not.toHaveBeenCalled();
  });

  it("does not update a finding when ownership lookup returns no state or finding", async () => {
    dbMocks.getFindingWorkflowStateForUser.mockResolvedValue(undefined);
    dbMocks.updateFindingWorkflowState.mockResolvedValue(undefined);
    const caller = appRouter.createCaller({ user: { id: 42, openId: "user-42", role: "user" } as never, req: {} as never, res: {} as never });
    await expect(caller.scans.updateFindingStatus({ findingId: 99, status: "acknowledged" })).rejects.toThrow("Finding not found.");
    expect(dbMocks.updateFindingWorkflowState).toHaveBeenCalledWith({ findingId: 99, userId: 42, status: "acknowledged" });
  });

  it("rejects authenticated crawl navigation outside the approved same-origin allowlist", async () => {
    const caller = appRouter.createCaller({ user: { id: 42, openId: "user-42", role: "user" } as never, req: {} as never, res: {} as never });
    await expect(caller.scans.createCrawl({
      startUrl: "https://example.com/",
      allowedUrls: ["https://example.com/", "https://other.example/"],
      steps: [{ type: "open", url: "https://example.com/" }, { type: "scan_page" }],
      credentials: { username: "user", password: "secret" },
    })).rejects.toThrow("same origin");
  });

  it("rejects live takeover input for a foreign crawl session", async () => {
    dbMocks.getCrawlSessionForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller({ user: { id: 42, openId: "user-42", role: "user" } as never, req: {} as never, res: {} as never });
    await expect(caller.scans.crawlInput({ sessionId: 900, action: { type: "resume" } })).rejects.toThrow("Crawl session not found.");
    expect(dbMocks.getCrawlSessionForUser).toHaveBeenCalledWith(900, 42);
  });

  it("rejects loopback authenticated crawl targets before starting a browser", async () => {
    const caller = appRouter.createCaller({ user: { id: 42, openId: "user-42", role: "user" } as never, req: {} as never, res: {} as never });
    await expect(caller.scans.createCrawl({
      startUrl: "http://127.0.0.1/",
      allowedUrls: ["http://127.0.0.1/"],
      steps: [{ type: "scan_page" }],
      credentials: { username: "user", password: "secret" },
    })).rejects.toThrow(/loopback|private|Local network/i);
  });

  it("does not expose a report owned by another user", async () => {
    dbMocks.getReportForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    await expect(caller.scans.report({ id: 7 })).resolves.toBeUndefined();
    expect(dbMocks.getReportForUser).toHaveBeenCalledWith(7, 42);
  });

  it("rejects detailed report access when the report is not owned", async () => {
    dbMocks.getReportDetailForUser.mockResolvedValue(undefined);
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    await expect(caller.scans.reportDetail({ id: 7 })).resolves.toBeUndefined();
    expect(dbMocks.getReportDetailForUser).toHaveBeenCalledWith(7, 42);
  });

  it("keeps report detail linked to the owned scan snapshot", async () => {
    const report = { report: { id: 7, scanJobId: 99, score: 88, summary: "2 findings" }, job: { id: 99, userId: 42, status: "completed" }, findings: [{ id: 1, scanJobId: 99, severity: "serious", ruleId: "img-alt" }] };
    dbMocks.getReportForUser.mockResolvedValue(report);
    const caller = appRouter.createCaller({
      user: { id: 42, openId: "user-42", role: "user" } as never,
      req: {} as never,
      res: {} as never,
    });
    dbMocks.getReportDetailForUser.mockResolvedValue(report);
    await expect(caller.scans.reportDetail({ id: 7 })).resolves.toEqual(report);
    expect(report.report.scanJobId).toBe(report.job.id);
    expect(report.job.userId).toBe(42);
    expect(report.findings.every(finding => finding.scanJobId === report.report.scanJobId)).toBe(true);
    await expect(caller.scans.report({ id: 7 })).resolves.toEqual(report);

    expect(report.report.scanJobId).toBe(report.job.id);
    expect(report.job.userId).toBe(42);
    expect(report.findings.every(finding => finding.scanJobId === report.report.scanJobId)).toBe(true);
  });
});
