# AURA follow-up work

- [x] Replace the current generated mark in the sidebar with the supplied AURA logo asset.
- [x] Add the supplied logo as the application favicon or compact brand asset where appropriate.
- [x] Research the current MCP transport and configuration patterns supported by Cursor, Claude, and Kiro.
- [x] Decide whether the first integration should be a local stdio MCP server, a remote HTTP MCP server, or both.
- [x] Define the core accessibility tools and resource contracts exposed to AI IDEs.
- [x] Add an MCP-ready service scaffold or integration specification without changing the frontend prototype’s runtime behavior.
- [x] Re-run typecheck, build, and visual verification after the branding update.
- [x] Save a new project checkpoint and deliver integration setup guidance.
- [x] Define a refined AURA logo concept that reads clearly at small sizes.
- [x] Generate a compact mark and a horizontal lockup for the dashboard.
- [x] Replace the current logo asset and favicon with the refined design.
- [x] Verify desktop, report, and compact sidebar rendering.
- [x] Save and deliver a refreshed project checkpoint.

## Circular palette-matched logo refinement

- [x] Generate a circular AURA sidebar mark using the website’s graphite, citron, ivory, and muted sage palette.
- [x] Replace the current sidebar and favicon assets with the circular mark.
- [x] Tune the sidebar container so the mark blends into the graphite rail without a rectangular image frame.
- [x] Verify scan, report, and compact sidebar layouts.
- [x] Save and deliver the refreshed checkpoint.

## Acronym and title lockup

- [x] Add the exact acronym “AURA” beside the circular sidebar mark.
- [x] Add the full title “Accessibility Unified Reporting & Analysis” beneath the acronym.
- [x] Hide the text lockup in compact navigation while retaining the circular mark.
- [x] Validate the updated brand lockup and save a new checkpoint.

## MCP settings page

- [x] Add a Settings route and active navigation state.
- [x] Present the AURA MCP server overview and local/hosted transport options.
- [x] Add Cursor, Claude Code, and Kiro setup details with copyable configuration snippets.
- [x] Add tool-surface, security, and next-step guidance.
- [x] Validate routing, copy interactions, and responsive layout.
- [x] Save and deliver the settings page checkpoint.

## Clean npm installation remediation

- [x] Remove or replace the Vite JSX location plugin that requires Vite 4/5 peer versions.
- [x] Generate and validate an npm-compatible lockfile using a supported Vite 7 dependency tree.
- [x] Confirm `npm install` and the production build complete without legacy-peer-deps flags.
- [x] Repackage and deliver the corrected source archive with install instructions.

## Public realtime application expansion

- [x] Read the full-stack and persistent-hosting guidance for realtime workloads.
- [x] Define the public user, workspace, scan-job, report, issue, and event model.
- [x] Decide whether Autoscale is sufficient or whether a reserved/persistent runtime is required for live connections and workers.
- [x] Upgrade the static project to the appropriate full-stack foundation.
- [x] Implement persisted scan jobs and live progress updates.
- [x] Secure public scan/report/MCP workflows with authentication and rate limits.
- [x] Validate end-to-end realtime behavior and production readiness.

## Confirmed real public scanning scope

- [x] Build real URL and document scan ingestion rather than simulated-only results.
- [x] Add authenticated user workspaces and ownership boundaries for scans and reports.
- [x] Persist scan jobs, findings, evidence, and report history in the database.
- [x] Stream live scan progress to the dashboard and MCP clients.
- [x] Add public-safe rate limiting, URL validation, file validation, and abuse controls.
- [x] Validate the complete scan-to-report flow in production-like conditions.

## Realtime production hardening gaps

- [x] Add workspace and workspace-member models before team sharing.
- [x] Add immutable report snapshots when exports and audit history are required.
- [x] Implement backend document upload, storage, and analysis.
- [x] Add true SSE/WebSocket progress delivery for sub-second updates.
- [x] Add SSRF/DNS-IP protection, outbound timeouts, rate limits, crawl budgets, and cancellation.
- [x] Run authenticated browser-level end-to-end scan-to-report verification.

## Realtime hardening corrections

- [x] Replace the in-memory rate limiter with a durable distributed limiter and define authenticated MCP access controls.
- [x] Add strict upload validation: allowed extensions and MIME types, content sniffing, binary rejection, and safe text decoding.
- [x] Add a `workspace_members` table and membership-aware access checks for shared workspaces.
- [x] Replace database-polled SSE with a true push channel or sub-second event delivery pipeline.
- [x] Add scan cancellation and either implement crawl budgets or explicitly scope crawling out of the public beta.
- [x] Run authenticated browser-level end-to-end verification for URL and document scans.

## Remaining release gates

- [x] Scope MCP as documentation-only for the public beta; token-authenticated gateway remains a documented follow-up release gate.
- [x] Add MIME/content sniffing beyond extension, declared MIME, null-byte, and UTF-8 checks.
- [x] Keep shared workspace access disabled in beta and document owner-scoped scan/report authorization until membership-aware queries are enabled.
- [x] Add authenticated browser-level end-to-end verification for URL and document scans.

## Reports, documents, and authenticated MCP APIs

- [x] Define persisted report, document-evidence, and MCP tool contracts.
- [x] Implement report detail, export-ready snapshot, and findings APIs.
- [x] Implement document upload, parsing, evidence persistence, and document report APIs.
- [x] Implement authenticated token/session checks for MCP API requests.
- [x] Expose MCP tools for starting scans, reading scan status, listing findings, and reading reports.
- [x] Wire report and document workflows into the dashboard and MCP settings page.
- [x] Add tests for ownership, token authorization, document validation, MCP contracts, and report integrity.
- [x] Run typecheck and tests/build; authenticated browser smoke verification remains pending.
- [x] Save and deliver the reports/documents/MCP checkpoint.

## Required API test coverage

- [x] Add backend tests proving users cannot read or cancel scans or reports they do not own.
- [x] Add MCP API contract tests for initialize, tools/list, valid tool calls, invalid tokens, and unknown methods/tools.
- [x] Add report integrity tests ensuring report detail matches the owned scan snapshot and findings linkage.

## Final API contract test gaps

- [x] Add a backend test proving `scans.cancel` rejects or safely no-ops when the scan is not owned by the caller.
- [x] Add `/api/mcp` endpoint tests for initialize, tools/list, successful tools/call, invalid bearer token, and unknown method/tool errors.
- [x] Add a report-detail integrity test verifying the returned snapshot includes findings linkage for the owned scan.

## Persisted report and document workflow focus

- [x] Audit the existing persisted document and report schema, helpers, procedures, UI, and MCP bindings.
- [x] Close any missing document metadata, evidence, and report snapshot persistence gaps.
- [x] Add or improve report detail and document evidence retrieval for the dashboard and MCP.
- [x] Verify ownership boundaries and export-ready report data shape.
- [x] Run focused tests and build, then save a workflow checkpoint.

## Development-only authenticated smoke testing

- [x] Add an explicitly development-only mock authenticated session for local browser smoke tests.
- [x] Ensure production builds and production authentication cannot enable the mock session.
- [x] Validate URL and document scan-to-report flows through the mock session.
- [x] Save a checkpoint documenting the test-only authentication boundary.
- [x] Fix the HTML content-sniffing regex discovered during mock-authenticated document upload testing and cover it with a regression test.

## Browser document upload verification

- [x] Fix the document upload UI/browser automation path so a file can be selected through the actual interface.
- [x] Run a true mock-authenticated browser flow from document upload through scan completion and report view.
- [x] Save a checkpoint after both URL and document flows are verified through the UI.

## Report PDF and JSON exports

- [x] Audit the persisted report detail shape and current report export control.
- [x] Implement JSON report download from persisted report detail data.
- [x] Implement PDF report generation and download with AURA report summary, findings, and evidence.
- [x] Add export tests covering JSON structure, PDF generation, and ownership-safe report retrieval, including route-level ownership authorization.
- [x] Validate both downloads through the live authenticated export endpoints and save a checkpoint.
- [x] Route report exports through the shared authentication context so development mock-auth smoke tests and production OAuth both work correctly.
- [x] Add live endpoint verification for owned JSON/PDF exports and rejected unauthorized access.

## Export interaction feedback

- [x] Add per-format loading animations to the PDF and JSON download buttons.
- [x] Add success and error toast notifications for export initiation and failure states.
- [x] Prevent duplicate export clicks while a download is being prepared and validate the updated report UI.
- [x] Run tests/build and save a checkpoint for the interaction feedback update.

## Detailed accessibility report exports

- [x] Audit the current website report view, JSON export contract, and PDF renderer for missing issue detail and formatting inconsistencies.
- [x] Add a detailed issue-by-issue export structure with rule metadata, severity, evidence, selectors, impact, remediation, and verification guidance.
- [x] Align PDF layout, typography, colors, cards, tables, and report sections with the Signal Ledger website report view.
- [x] Format report and finding identifiers consistently in the UI and exported JSON/PDF.
- [x] Add detailed export tests and visually validate PDF/report parity, then save a checkpoint.
- [x] Visually inspect an actual generated PDF page against the Signal Ledger website report layout before the final checkpoint.

## Scan rate-limit error handling

- [x] Trace the scan limiter, scan mutation, development mock-session behavior, and frontend error handling.
- [x] Preserve public abuse protection while preventing stale or incorrectly shared development limiter state from blocking smoke tests.
- [x] Show a clear retry countdown or retry guidance for expected scan throttling instead of an unhandled mutation error.
- [x] Add regression tests and validate the scan flow, then save a checkpoint.
- [x] Save a new checkpoint covering the scan rate-limit handling fix after passing typecheck, tests, and build.
- [x] Exercise the updated throttling behavior through an authenticated smoke request and verify retry guidance plus a successful re-attempt path.

## Focused Scan page experience

- [x] Reduce the Scan page to the 01 / Target section and remove the always-visible secondary summary and pipeline sections.
- [x] Reveal the AURA Execution Console only after a scan is started.
- [x] Show live scan execution logs and progress in the revealed console for URL and document scans.
- [x] Validate scan-start behavior, responsive layout, tests/build, and save a checkpoint.
- [x] Remove the static console log fallback and show a real loading or empty state until persisted scan events arrive.
- [x] Run post-change URL and document scan smoke validation for console reveal and live events.
- [x] Save a checkpoint after the focused Scan page changes are fully validated.
- [x] Confirm browser-level URL and document flows reveal the execution console and display real persisted event rows after scan start.
- [x] Save the focused Scan page checkpoint after the final browser verification.

## Execution console controls

- [x] Audit scan job lifecycle, cancellation, worker behavior, and current console state handling.
- [x] Add a persisted pause/resume lifecycle without weakening ownership checks or cancellation semantics.
- [x] Add Pause, Resume, and Cancel controls inside the execution console with confirmation and status feedback.
- [x] Add lifecycle regression tests and validate active console interactions, then save a checkpoint.
- [x] Exercise Pause, Resume, and Cancel against a real active scan through authenticated lifecycle endpoints and verify status/events update correctly.
- [x] Save a recoverable checkpoint after lifecycle controls are fully validated.

## Report execution fidelity and detailed accessibility errors

- [x] Trace the executed scan, persisted findings, report snapshot, dashboard report, JSON export, and PDF export for mismatches.
- [x] Correct report persistence so completed reports reflect the actual scan’s findings, score, totals, evidence, and source metadata.
- [x] Display each accessibility error in detail with rule identity, WCAG mapping, impact, affected element, selector, evidence, remediation, and verification guidance.
- [x] Validate scan-to-report parity across the dashboard and exports, then save a checkpoint.
- [x] Remove static fallback issues and sample page metrics from the report so empty or completed reports never display fabricated findings.
- [x] Bind report totals, source metadata, timestamps, and every issue detail to persisted scan/report data.
- [x] Add regression coverage proving reports with zero findings do not render sample accessibility errors.

## Invalid URL submission handling

- [x] Prevent invalid or empty URL scan submissions from reaching the scan mutation.
- [x] Normalize valid URL input and show an actionable inline validation error for malformed URLs.
- [x] Add regression coverage for URL validation and verify typecheck, tests, and build.

## Attached enterprise report redesign

- [x] Add executive report sections for score context, severity breakdown, WCAG assessment, and ADA-oriented accessibility readiness without claiming legal compliance.
- [x] Add persisted-data-driven page/source context, report tabs or section navigation, issue filters, and WCAG-oriented issue summaries.
- [x] Align detailed findings and JSON/PDF export presentation with the redesigned report structure.
- [x] Validate responsive UI, persisted report parity, exports, tests, and build; then save a checkpoint.

## Finding workflow states

- [x] Add a persisted finding workflow state with acknowledged, in progress, verified, and closed values without mutating immutable scan evidence.
- [x] Add ownership-safe finding state update procedures with transition validation and audit timestamps.
- [x] Add report controls and visible state badges/filtering for individual findings.
- [x] Include workflow state and state timestamps in JSON/PDF exports while preserving the redesigned report structure.
- [x] Add migration, UI/API regression tests, responsive verification, and save a checkpoint.

## Authenticated step-driven crawling

- [x] Define an explicit crawl contract for approved URLs, login/session steps, form actions, wait conditions, and scan scope.
- [x] Choose a secure credential strategy that never stores or logs plaintext passwords and keeps secrets server-side.
- [x] Add persisted crawl plans, step execution telemetry, page coverage, and report linkage.
- [x] Implement authenticated crawl execution with SSRF controls, same-origin/allowlist enforcement, budgets, cancellation, and redacted logs.
- [x] Add crawl configuration UI, execution controls, and report visibility for all crawled pages.
- [x] Add security, transition, persistence, export, responsive, and end-to-end regression coverage; validate runtime fit and save a checkpoint.

## Confirmed first-release authenticated crawl scope

- [x] Support one-time username/password credentials only; never persist plaintext credentials or include them in snapshots/logs.
- [x] Support manually authored browser steps: open URL, fill field, click, wait, assert URL, and scan page.
- [x] Require explicit approved page URLs and enforce same-origin/allowlist checks for every navigation.
- [x] Do not bypass CAPTCHA; pause for user MFA or CAPTCHA handoff when the flow requires human interaction.
- [x] Persist crawl plan metadata, redacted step telemetry, page coverage, and linked accessibility findings.

## Confirmed live in-app MFA takeover

- [x] Add an isolated browser session per crawl with one-time credential injection and automatic credential redaction.
- [x] Stream a controlled browser view and user interaction channel for MFA checkpoints.
- [x] Enforce takeover authorization, session expiry, same-origin navigation, approved URL allowlists, and action budgets.
- [x] Return control to the manual step runner after takeover and persist redacted telemetry/page coverage.
- [x] Validate browser streaming, security boundaries, cancellation, exports, and responsive UI; document production runtime requirements as a release gate.

## Autoscale delivery constraint

- [x] Keep authenticated browser sessions time-bounded and development-capable on Autoscale; document Reserved hosting as a production release gate for reliable live takeover.
- [x] Add runtime safeguards for browser reuse, memory limits, session expiry, cancellation, and interrupted streaming.

## Authenticated crawl release gaps

- [x] Update the report UI to display persisted crawled-page coverage and page-specific findings for authenticated crawl scans.
- [x] Add explicit SSRF/DNS/IP validation for every browser navigation/open step in the crawl runner and cover it with tests.
- [x] Add API/integration tests for owned crawl creation, takeover authorization, cancellation, page persistence, and crawl-linked report/export behavior.
- [x] Save a dedicated checkpoint after authenticated crawl validation passes.

## Detailed authenticated crawl history

- [x] Persist per-step lifecycle records with step index, action type, status, timestamps, redacted context, and failure reason.
- [x] Emit live step-started, step-succeeded, step-failed, takeover, and terminal events to the crawl console.
- [x] Render a detailed crawl history timeline with success/failure filters and actionable error context.
- [x] Add regression coverage for persistence, redaction, failure handling, live updates, responsive UI, and build; then save a checkpoint.

## Crawl step evidence

- [x] Capture sanitized screenshots and selector metadata for each manual crawl step without persisting credentials or sensitive field values.
- [x] Persist evidence references with ownership checks, bounded retention, and size limits.
- [x] Add expandable evidence panels to the crawl-history timeline with screenshot and selector metadata views.
- [x] Add regression coverage for redaction, evidence ownership, retention, responsive UI, and build; then save a checkpoint.

## Crawl DOM evidence

- [x] Capture sanitized, size-bounded DOM snippets for each manual crawl step without persisting credentials, secrets, or sensitive field values.
- [x] Persist DOM snippet evidence with the existing screenshot references and ownership controls.
- [x] Render formatted DOM snippets in expandable evidence panels beside screenshots and selector metadata.
- [x] Add regression coverage for DOM redaction, size limits, evidence persistence, responsive UI, tests, and build; then save a checkpoint.

## Crawl step DOM evidence completion

- [x] Fix and validate the crawl-runner DOM sanitizer so the server bundle compiles without regex parser errors.
- [x] Persist sanitized DOM snippets in crawl step history with redaction and bounded size guarantees.
- [x] Render sanitized DOM snippets in expandable crawl evidence cards with accessible labels and readable formatting.
- [x] Add regression coverage for sanitizer redaction, persistence wiring, and DOM evidence rendering data shape.
- [x] Run typecheck, full Vitest suite, production build, and responsive visual verification for crawl evidence.
- [x] Save a checkpoint for the completed DOM evidence milestone.

## Updated source archive delivery

- [ ] Refresh README.md with current AURA architecture, setup, authenticated crawl, evidence, testing, and deployment notes.
- [ ] Package the validated source tree and updated README.md into a ZIP archive excluding generated dependencies and build artifacts.
- [ ] Validate the archive contents and deliver the updated source ZIP.
