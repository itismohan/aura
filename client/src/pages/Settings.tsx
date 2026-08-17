// Signal Ledger: settings is an evidence-led integration guide with graphite chrome, ivory surfaces, citron actions, and monospaced setup instructions.
import { useMemo, useState } from "react";
import { Check, CheckCircle2, Clipboard, Cloud, Code2, ExternalLink, KeyRound, Server, Terminal } from "lucide-react";

type Ide = "cursor" | "claude" | "kiro";

const snippets: Record<Ide, string> = {
  cursor: `{
  "mcpServers": {
    "aura": {
      "url": "https://YOUR_AURA_DOMAIN/api/mcp",
      "headers": {
        "Authorization": "Bearer \${env:AURA_MCP_API_TOKEN}"
      }
    }
  }
}`,
  claude: `claude mcp add --transport http aura https://YOUR_AURA_DOMAIN/api/mcp \\
  --header "Authorization: Bearer $AURA_MCP_API_TOKEN"`,
  kiro: `{
  "mcpServers": {
    "aura": {
      "url": "https://YOUR_AURA_DOMAIN/api/mcp",
      "headers": {
        "Authorization": "Bearer \${env:AURA_MCP_API_TOKEN}"
      }
    }
  }
}`,
};

const ideMeta: Record<Ide, { label: string; path: string; detail: string }> = {
  cursor: { label: "Cursor", path: ".cursor/mcp.json", detail: "Add this to the project config or your global Cursor MCP settings." },
  claude: { label: "Claude Code", path: ".mcp.json", detail: "Run the command in your terminal, or add a project-scoped server definition." },
  kiro: { label: "Kiro", path: "MCP configuration", detail: "Add the server to Kiro’s MCP configuration or distribute it as a Power." },
};

const tools = [
  ["aura_scan_url", "Scan a URL against a selected WCAG profile."],
  ["aura_scan_document", "Analyze a PDF, Office file, HTML, CSV, JSON, or text document."],
  ["aura_get_scan", "Read status, score, severity counts, and completion metadata."],
  ["aura_list_issues", "Filter findings by page, severity, WCAG rule, or status."],
  ["aura_cancel_scan", "Cancel an active scan owned by the authenticated workspace."],
];

export default function SettingsPage() {
  const [ide, setIde] = useState<Ide>("cursor");
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(() => snippets[ide], [ide]);

  async function copySnippet() {
    await navigator.clipboard?.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="aura-page settings-page">
      <section className="settings-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MCP INTEGRATION</div>
          <h1>Bring AURA into the tools where work gets fixed.</h1>
          <p>Connect your accessibility evidence layer to Cursor, Claude Code, Kiro, and compatible agents through one portable MCP server contract.</p>
        </div>
        <div className="settings-hero-signal"><Server size={17} /><span>Server status</span><strong>Hosted API ready</strong><i /></div>
      </section>

      <section className="settings-transport-grid" aria-label="MCP transports">
        <article className="settings-panel transport-panel is-selected">
          <div className="panel-icon"><Terminal size={17} /></div>
          <div><div className="panel-kicker">LOCAL / FOLLOW-UP</div><h2>stdio wrapper</h2><p>A local package wrapper is a follow-up distribution option. The current public beta exposes the authenticated hosted API below.</p></div>
          <div className="panel-status is-muted"><CheckCircle2 size={14} /> Planned wrapper</div>
        </article>
        <article className="settings-panel transport-panel">
          <div className="panel-icon is-cloud"><Cloud size={17} /></div>
          <div><div className="panel-kicker">TEAM / HOSTED</div><h2>Authenticated HTTP</h2><p>Use a hosted endpoint when teams need shared scan history, organization policy, and centralized audit events.</p></div>
          <div className="panel-status"><KeyRound size={14} /> Token protected</div>
        </article>
      </section>

      <section className="settings-panel setup-panel">
        <div className="settings-section-heading"><div><div className="panel-kicker">01 / SETUP</div><h2>Connect an AI IDE</h2><p>Choose your client to see the exact configuration path and starter snippet.</p></div><div className="settings-badge"><Code2 size={14} /> MCP compatible</div></div>
        <div className="ide-tabs" role="tablist" aria-label="AI IDE setup options">
          {(Object.keys(ideMeta) as Ide[]).map((key) => <button key={key} className={ide === key ? "is-active" : ""} onClick={() => setIde(key)} role="tab" aria-selected={ide === key}>{ideMeta[key].label}</button>)}
        </div>
        <div className="setup-content">
          <div className="setup-instructions"><div className="panel-kicker">CONFIGURATION PATH</div><h3>{ideMeta[ide].path}</h3><p>{ideMeta[ide].detail}</p><ol><li>Set the AURA hosted domain and create a dedicated MCP bearer token.</li><li>Set <code>AURA_MCP_API_TOKEN</code> in the environment used by your IDE.</li><li>Paste the snippet, restart the client, and approve the AURA tools.</li></ol><a href="https://modelcontextprotocol.io/" target="_blank" rel="noreferrer">Read the MCP specification <ExternalLink size={13} /></a></div>
          <div className="code-card"><div className="code-card-header"><span><span className="code-dot" /> {ideMeta[ide].label} config</span><button onClick={copySnippet} aria-label="Copy configuration"><CopyIcon copied={copied} /> {copied ? "Copied" : "Copy"}</button></div><pre><code>{snippet}</code></pre></div>
        </div>
      </section>

      <section className="settings-lower-grid">
        <article className="settings-panel tool-surface"><div className="panel-kicker">02 / TOOL SURFACE</div><h2>What your agent can call</h2><div className="tool-list">{tools.map(([name, description]) => <div className="tool-row" key={name}><span className="tool-glyph">›_</span><div><strong>{name}</strong><p>{description}</p></div></div>)}</div></article>
        <article className="settings-panel security-surface"><div className="panel-kicker">03 / SECURITY</div><h2>Keep approvals explicit.</h2><p>AURA is read-only by default. The hosted MCP endpoint requires a bearer token, and scans, issue evidence, reports, and cancellation stay behind authenticated ownership checks.</p><div className="security-list"><span><Check size={14} /> Target allowlists for crawls</span><span><Check size={14} /> Secret redaction in evidence</span><span><Check size={14} /> No automatic source mutations</span></div><button className="text-action" onClick={() => window.alert("Security policy editor is coming soon.")}>Review policy controls <ExternalLink size={13} /></button></article>
      </section>
    </div>
  );
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? <Check size={14} /> : <Clipboard size={14} />;
}
