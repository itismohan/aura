import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  getReportDetailForUser: vi.fn(),
  authenticateRequest: vi.fn(),
}));

vi.mock("./db", () => ({ getReportDetailForUser: mocks.getReportDetailForUser }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));

import { registerReportExportRoutes } from "./report-export-routes";

function setup() {
  const routes: Record<string, (req: Request, res: Response) => Promise<void>> = {};
  const app = { get: (path: string, handler: (req: Request, res: Response) => Promise<void>) => { routes[path] = handler; } } as unknown as Express;
  registerReportExportRoutes(app);
  return routes;
}

function response() {
  const state: { statusCode: number; headers: Record<string, string>; body: unknown } = { statusCode: 200, headers: {}, body: undefined };
  const res = {
    status(code: number) { state.statusCode = code; return this; },
    json(body: unknown) { state.body = body; return this; },
    setHeader(name: string, value: string) { state.headers[name] = value; return this; },
    type(value: string) { state.headers["Content-Type"] = value; return this; },
    send(body: unknown) { state.body = body; return this; },
  } as unknown as Response;
  return { res, state };
}

describe("report export routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports owned reports as JSON and PDF", async () => {
    const routes = setup();
    mocks.authenticateRequest.mockResolvedValue({ id: 42 });
    mocks.getReportDetailForUser.mockResolvedValue({
      report: { id: 7, title: "Owned report", summary: "Accessibility summary", score: 88, createdAt: new Date() },
      job: { id: 11, targetUrl: "https://example.com", scanType: "url", status: "completed", totalFindings: 1, createdAt: new Date() },
      findings: [{ ruleId: "A11Y-001", title: "Missing label", severity: "serious", selector: "#email", description: "The field has no accessible name.", evidence: "<input id=\"email\">", remediation: "Add a programmatic label." }],
      document: null,
    });

    const json = response();
    await routes["/api/reports/:id/export.json"]({ params: { id: "7" }, headers: {} } as unknown as Request, json.res);
    expect(json.state.statusCode).toBe(200);
    expect(json.state.headers["Content-Disposition"]).toContain("AURA-RPT-000007.json");
    const jsonPayload = JSON.parse(String(json.state.body));
    expect(jsonPayload.reportId).toBe("AURA-RPT-000007");
    expect(jsonPayload.report.title).toBe("Owned report");
    expect(jsonPayload.findings[0].id).toBe("AURA-FND-000011-001");
    expect(jsonPayload.findings[0].impact).toBeTypeOf("string");
    expect(jsonPayload.findings[0].verification).toBeTypeOf("string");

    const pdf = response();
    await routes["/api/reports/:id/export.pdf"]({ params: { id: "7" }, headers: {} } as unknown as Request, pdf.res);
    expect(pdf.state.statusCode).toBe(200);
    expect(pdf.state.headers["Content-Disposition"]).toContain("AURA-RPT-000007.pdf");
    expect((pdf.state.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(mocks.getReportDetailForUser).toHaveBeenCalledWith(7, 42);
  });

  it("rejects unauthenticated and foreign report exports", async () => {
    const routes = setup();
    mocks.authenticateRequest.mockResolvedValue(null);
    const unauthenticated = response();
    await routes["/api/reports/:id/export.json"]({ params: { id: "7" }, headers: {} } as unknown as Request, unauthenticated.res);
    expect(unauthenticated.state.statusCode).toBe(401);
    expect(mocks.getReportDetailForUser).not.toHaveBeenCalled();

    mocks.authenticateRequest.mockResolvedValue({ id: 42 });
    mocks.getReportDetailForUser.mockResolvedValue(undefined);
    const foreign = response();
    await routes["/api/reports/:id/export.pdf"]({ params: { id: "7" }, headers: {} } as unknown as Request, foreign.res);
    expect(foreign.state.statusCode).toBe(404);
    expect(mocks.getReportDetailForUser).toHaveBeenCalledWith(7, 42);
  });
});
