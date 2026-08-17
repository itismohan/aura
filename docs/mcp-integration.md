# AURA MCP integration blueprint

## Recommendation

AURA is a strong fit for an **MCP server**, not just a static AI agent. MCP gives Cursor, Claude Code, Kiro, and other compatible clients a shared tool contract while AURA remains the system that performs scans, stores evidence, and renders reports.

The recommended rollout is a dual transport architecture. Start with a local **stdio** server for individual developers and CI workflows, then add a hosted **Streamable HTTP** endpoint with OAuth or short-lived bearer tokens for teams. This keeps the first version easy to install while leaving room for centralized scan history, organization policy, and audit trails.

## Proposed MCP surface

| Type | Name | Purpose |
|---|---|---|
| Tool | `aura_scan_url` | Scan a URL against a selected WCAG profile and return a scan ID plus summary. |
| Tool | `aura_scan_document` | Analyze a PDF, Office file, HTML, CSV, JSON, or text document and return a scan ID. |
| Tool | `aura_get_scan` | Read scan status, score, severity counts, affected pages, and completion metadata. |
| Tool | `aura_list_issues` | Return filtered issues by scan ID, page, severity, WCAG rule, or status. |
| Tool | `aura_get_issue` | Return evidence, selector or document location, rule explanation, and remediation guidance. |
| Tool | `aura_create_fix_draft` | Generate a developer-ready issue or patch suggestion without applying changes automatically. |
| Resource | `aura://scans/{scanId}` | Stable read-only report resource for an entire scan. |
| Resource | `aura://issues/{issueId}` | Stable read-only evidence resource for an individual finding. |
| Prompt | `aura_review_accessibility` | Ask an AI IDE to review the current workspace against the latest AURA findings. |

Every tool should return structured JSON with `scanId`, `status`, `standard`, `score`, `issues`, and `nextAction` fields where applicable. Long scans should return quickly with a queued status; the client can poll `aura_get_scan` or subscribe to a future webhook/event channel.

## AI-IDE compatibility

| Client | Local option | Remote option | Suggested configuration |
|---|---|---|---|
| Cursor | stdio | Streamable HTTP or SSE | Project `.cursor/mcp.json` or user `~/.cursor/mcp.json` |
| Claude Code | stdio | HTTP, SSE, or WebSocket | Project `.mcp.json`, local scope, or user scope |
| Kiro | stdio | HTTP or SSE | MCP JSON configuration; can be distributed through Kiro Powers or enterprise registry |

The common denominator is a standard MCP server with a JSON tool schema. For maximum portability, keep AURA’s tool inputs provider-neutral and avoid relying on IDE-specific extensions. Cursor, Claude Code, and Kiro all document local and remote MCP setup paths; remote deployments should use explicit authentication and tool approval controls.

## Example local configuration

The example below assumes a published package named `@aura-compliance/mcp-server`. It is intentionally a configuration template: the final package name and command should be replaced when the service is published.

```json
{
  "mcpServers": {
    "aura": {
      "command": "npx",
      "args": ["-y", "@aura-compliance/mcp-server"],
      "env": {
        "AURA_API_URL": "https://api.example.com",
        "AURA_API_TOKEN": "${env:AURA_API_TOKEN}"
      }
    }
  }
}
```

For a hosted server, the equivalent configuration is:

```json
{
  "mcpServers": {
    "aura": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:AURA_API_TOKEN}"
      }
    }
  }
}
```

## Security model

AURA should treat URL scans, uploaded documents, issue evidence, and generated fix drafts as sensitive workspace data. Require explicit approval before mutating source code or opening pull requests. Enforce target allowlists for server-side crawling, isolate browser execution, cap crawl depth and file size, redact secrets from captured HTML and logs, and use per-user or per-workspace tokens rather than a shared global key.

The MCP server should be read-only by default. `aura_create_fix_draft` can generate a patch or issue body, but applying a code change should remain an explicit IDE action. For hosted use, add organization-level policy checks, audit events, rate limits, and retention controls before exposing the service to multiple teams.

## Agent versus MCP

An **MCP server** is the reusable integration layer. An **AURA agent** can sit on top of it and orchestrate a workflow such as “scan the current branch, group issues by WCAG rule, draft fixes, and summarize regression risk.” Building the MCP server first is the better foundation because the same tools can be consumed by Cursor, Claude Code, Kiro, internal agents, CI, and the AURA dashboard.

## Official references

- [Model Context Protocol](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro)
- [Cursor MCP documentation](https://cursor.com/docs/mcp)
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
- [Kiro MCP documentation](https://kiro.dev/docs/mcp/)
- [Kiro MCP configuration](https://kiro.dev/docs/mcp/configuration/)

## Implemented hosted API

The public beta now exposes an authenticated JSON-RPC endpoint at `/api/mcp`. Clients must send `Authorization: Bearer <AURA_MCP_API_TOKEN>`. Invalid tokens receive JSON-RPC error `-32001`; valid requests expose `initialize`, `tools/list`, and `tools/call`.

Implemented tools:

- `aura_scan_url` — start an ownership-scoped URL scan.
- `aura_scan_document` — submit supported HTML, Markdown, JSON, CSV, or text content as base64.
- `aura_get_scan` — read scan status and summary.
- `aura_list_issues` — read evidence-backed findings for a scan.
- `aura_get_report` — read one persisted report snapshot.
- `aura_list_reports` — list recent reports for the authenticated workspace.
- `aura_cancel_scan` — cancel an active owned scan.

The hosted adapter currently resolves the authenticated beta MCP token to the configured owner workspace. Per-user and team-scoped MCP credentials remain a release-hardening task before broad multi-tenant distribution. The local stdio wrapper remains deferred; Cursor, Claude Code, and Kiro should use the hosted HTTP snippets in the Settings page.
