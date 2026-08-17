# AURA realtime application architecture

## Current implementation

AURA is now a full-stack React, Express, tRPC, Manus OAuth, Drizzle, and MySQL/TiDB application. Authenticated users can create URL scan jobs, which are persisted in `scan_jobs`. The worker fetches the target over HTTP(S), records evidence-backed findings in `scan_findings`, records stage updates in `scan_events`, and exposes ownership-scoped procedures for the dashboard and MCP integration surface.

The current browser experience uses authenticated tRPC polling at one-second intervals while a scan is active. This is intentionally compatible with Autoscale hosting and does not require a permanently open in-memory worker process. It is realtime enough for the first public beta, but it is not yet an SSE or WebSocket transport.

## Hosting decision

The first public beta should remain on **Autoscale** with database-backed job state. This keeps idle costs low and ensures scan progress survives individual request lifecycles. A **Reserved** runtime becomes appropriate when AURA introduces a durable browser worker, high-volume crawling, a long-lived SSE/WebSocket service, or a queue consumer that must stay warm continuously.

## Scope boundaries

The current URL scanner performs a real HTTP fetch and a focused set of HTML checks for missing alternative text, document language, page title, accessible link names, and accessible button names. It is not a complete WCAG conformance engine. Document uploads currently remain a frontend intake path and require a storage-backed parser before they should be exposed as a public production capability.

The current workspace boundary is the authenticated Manus user. A dedicated multi-member `workspaces` and `workspace_members` model should be introduced before team sharing or organization billing. Reports are currently derived from persisted scan jobs and findings; a separate `scan_reports` table can be added when report versioning, exports, or immutable audit snapshots are required.

## Production hardening still required

Before public launch, add SSRF protection and DNS/IP validation, rate limiting, upload size and MIME validation, outbound request timeouts, crawl budgets, a durable queue, job cancellation, audit logging, and a true SSE/WebSocket event stream if sub-second updates are required. The MCP server should expose job status and findings only after the same authentication and ownership checks as the web application.


## MCP public-beta scope

For the current public beta, MCP support is documentation-only. The Settings page provides IDE configuration guidance for Cursor, Claude Code, and Kiro, but AURA does not expose a public token-authenticated MCP gateway yet. A future gateway must use workspace-scoped credentials, authenticated ownership checks, durable rate limits, audit logging, and explicit tool permissions before it is enabled for public use.


## Workspace sharing boundary

The public beta creates a personal workspace and records the owner membership, but team sharing is not exposed yet. Scan, finding, and report procedures remain owner-scoped by authenticated user ID. The `workspace_members` table is migration groundwork; membership-aware joins and role checks must be enabled before users can invite collaborators or access another user’s reports.
