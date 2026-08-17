import type { Express, Request, Response } from "express";
import { appRouter } from "./routers";
import { getUserByOpenId } from "./db";
import { ENV } from "./_core/env";
import { authenticateMcpToken } from "./mcp-auth";

export const MCP_TOOLS = [
  { name: "aura_scan_url", description: "Start an authenticated AURA accessibility scan for a public URL.", inputSchema: { type: "object", properties: { targetUrl: { type: "string", format: "uri" } }, required: ["targetUrl"], additionalProperties: false } },
  { name: "aura_scan_document", description: "Analyze a supported HTML, Markdown, JSON, CSV, or text document.", inputSchema: { type: "object", properties: { filename: { type: "string" }, mimeType: { type: "string" }, contentBase64: { type: "string" } }, required: ["filename", "contentBase64"] } },
  { name: "aura_get_scan", description: "Read the status and summary of an AURA scan.", inputSchema: { type: "object", properties: { scanId: { type: "integer" } }, required: ["scanId"] } },
  { name: "aura_list_issues", description: "List evidence-backed findings for an AURA scan.", inputSchema: { type: "object", properties: { scanId: { type: "integer" } }, required: ["scanId"] } },
  { name: "aura_get_report", description: "Read one immutable AURA report snapshot with findings and document evidence by report ID.", inputSchema: { type: "object", properties: { reportId: { type: "integer" } }, required: ["reportId"] } },
  { name: "aura_list_reports", description: "List the latest persisted AURA report snapshots for the authenticated workspace.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "aura_cancel_scan", description: "Cancel an active AURA scan owned by the authenticated workspace.", inputSchema: { type: "object", properties: { scanId: { type: "integer" } }, required: ["scanId"] } },
];

function jsonRpcResult(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function jsonRpcError(id: unknown, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function resolveMcpUser() {
  if (!ENV.ownerOpenId) return undefined;
  return getUserByOpenId(ENV.ownerOpenId);
}

export async function handleMcpRequest(req: Request, res: Response) {
  if (!authenticateMcpToken(req.header("authorization"))) {
    res.status(401).json(jsonRpcError(req.body?.id ?? null, -32001, "Invalid MCP bearer token."));
    return;
  }

  const request = req.body ?? {};
  const id = request.id ?? null;
  const method = request.method;
  const params = request.params ?? {};

  if (method === "initialize") {
    res.json(jsonRpcResult(id, { protocolVersion: "2025-06-18", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "aura-compliance", version: "0.1.0" } }));
    return;
  }
  if (method === "notifications/initialized") { res.status(202).end(); return; }
  if (method === "tools/list") { res.json(jsonRpcResult(id, { tools: MCP_TOOLS })); return; }
  if (method !== "tools/call") { res.status(400).json(jsonRpcError(id, -32601, `Unsupported MCP method: ${String(method)}`)); return; }

  const user = await resolveMcpUser();
  if (!user) { res.status(503).json(jsonRpcError(id, -32002, "The MCP owner workspace is not initialized.")); return; }
  const caller = appRouter.createCaller({ user, req: req as never, res: res as never });

  try {
    let output: unknown;
    switch (params.name) {
      case "aura_scan_url": output = await caller.scans.create({ targetUrl: params.arguments?.targetUrl, scanType: "url" }); break;
      case "aura_scan_document": output = await caller.scans.createDocument({ filename: String(params.arguments?.filename ?? "document.txt"), mimeType: String(params.arguments?.mimeType ?? "text/plain"), contentBase64: String(params.arguments?.contentBase64 ?? "") }); break;
      case "aura_get_scan": output = await caller.scans.get({ id: Number(params.arguments?.scanId) }); break;
      case "aura_list_issues": output = await caller.scans.findings({ id: Number(params.arguments?.scanId) }); break;
      case "aura_get_report": output = await caller.scans.reportDetail({ id: Number(params.arguments?.reportId) }); break;
      case "aura_list_reports": output = await caller.scans.reports(); break;
      case "aura_cancel_scan": output = await caller.scans.cancel({ id: Number(params.arguments?.scanId) }); break;
      default: res.status(400).json(jsonRpcError(id, -32602, `Unknown AURA tool: ${String(params.name)}`)); return;
    }
    res.json(jsonRpcResult(id, { content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP tool execution failed.";
    res.status(400).json(jsonRpcError(id, -32000, message));
  }
}

export function registerMcpRoutes(app: Express) {
  app.post("/api/mcp", handleMcpRequest);
}
