import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateMcpToken: vi.fn((value?: string) => value === "Bearer test-token"),
  getUserByOpenId: vi.fn(async () => ({ id: 42, openId: "owner", role: "user" })),
  getScanJobForUser: vi.fn(async () => ({ id: 9, userId: 42, status: "completed", score: 92 })),
  getReportDetailForUser: vi.fn(async () => ({ report: { id: 7, scanJobId: 9, score: 92 }, job: { id: 9, userId: 42 }, findings: [{ id: 1, scanJobId: 9, ruleId: "1.1.1", evidence: "img without alt" }], document: { filename: "audit.md", byteSize: 42 } })),
}));

vi.mock("./mcp-auth", () => ({ authenticateMcpToken: mocks.authenticateMcpToken }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getUserByOpenId: mocks.getUserByOpenId, getScanJobForUser: mocks.getScanJobForUser, getReportDetailForUser: mocks.getReportDetailForUser };
});

import { handleMcpRequest } from "./mcp-api";

function request(body: unknown, authorization = "Bearer test-token") {
  return { body, header: (name: string) => name.toLowerCase() === "authorization" ? authorization : undefined } as never;
}

function response() {
  const state: { statusCode: number; payload?: unknown; ended: boolean } = { statusCode: 200, ended: false };
  const res = {
    status(code: number) { state.statusCode = code; return res; },
    json(payload: unknown) { state.payload = payload; return res; },
    end() { state.ended = true; return res; },
  } as never;
  return { res, state };
}

describe("hosted MCP JSON-RPC endpoint", () => {
  it("returns initialize capabilities", async () => {
    const { res, state } = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 1, method: "initialize" }), res);
    expect(state.statusCode).toBe(200);
    expect(state.payload).toMatchObject({ result: { serverInfo: { name: "aura-compliance" } } });
  });

  it("lists the AURA tools", async () => {
    const { res, state } = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }), res);
    expect(state.payload).toMatchObject({ result: { tools: expect.arrayContaining([expect.objectContaining({ name: "aura_get_report" })]) } });
  });

  it("executes a valid scan-status tool call", async () => {
    const { res, state } = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "aura_get_scan", arguments: { scanId: 9 } } }), res);
    expect(state.payload).toMatchObject({ result: { structuredContent: { id: 9, status: "completed" } } });
  });

  it("returns detailed immutable report evidence", async () => {
    const { res, state } = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "aura_get_report", arguments: { reportId: 7 } } }), res);
    expect(state.payload).toMatchObject({ result: { structuredContent: { findings: [expect.objectContaining({ ruleId: "1.1.1" })], document: { filename: "audit.md", byteSize: 42 } } } });
  });

  it("rejects invalid bearer tokens", async () => {
    const { res, state } = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 4, method: "tools/list" }, "Bearer wrong"), res);
    expect(state.statusCode).toBe(401);
    expect(state.payload).toMatchObject({ error: { code: -32001 } });
  });

  it("rejects unknown methods and tools", async () => {
    const unknownMethod = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 5, method: "nope" }), unknownMethod.res);
    expect(unknownMethod.state.statusCode).toBe(400);
    expect(unknownMethod.state.payload).toMatchObject({ error: { code: -32601 } });

    const unknownTool = response();
    await handleMcpRequest(request({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } }), unknownTool.res);
    expect(unknownTool.state.statusCode).toBe(400);
    expect(unknownTool.state.payload).toMatchObject({ error: { code: -32602 } });
  });
});
