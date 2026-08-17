# AURA design direction

## Three stylistic approaches

### Theme Name: Signal Ledger
Very light editorial engineering interface with precise grid lines, ink typography, and a citron signal color. It makes compliance feel like an observable system rather than a bureaucratic form.
Probability: 0.07

### Theme Name: Night Observatory
A dark operator console with midnight surfaces, cool blue telemetry, and focused amber alerts. It emphasizes active monitoring and runtime diagnostics.
Probability: 0.04

### Theme Name: Quiet Utility
A calm neutral SaaS workspace with soft stone surfaces, restrained green status accents, and dense data hierarchy. It prioritizes approachability and operational clarity.
Probability: 0.09

## Selected direction: Signal Ledger

### Design Movement
Swiss editorial systems design fused with modern developer-tool observability: disciplined geometry, asymmetric composition, and a visible relationship between evidence and action.

### Core Principles
- Treat every metric as an instrument reading, not decoration.
- Use high-contrast ink, warm paper, and one ownable signal color for hierarchy.
- Make execution state visible through pipelines, timestamps, and explicit status labels.
- Prefer precise cards, rules, and tables over soft generic dashboard chrome.

### Color Philosophy
AURA uses a warm ivory field to feel trustworthy and archival, deep graphite ink for engineering precision, muted stone for secondary surfaces, and electric citron as the signature “active signal” color. Critical states use disciplined red/orange/blue markers with text labels and icons so color never carries meaning alone.

### Layout Paradigm
A persistent left rail anchors the product identity; the workspace uses an asymmetric split with dense evidence on the left and a live execution/health column on the right. Report pages alternate between wide executive summaries and narrow, high-signal tables instead of a repeated centered card grid.

### Signature Elements
- AURA mark: concentric radar arcs forming an open eye, used at meaningful size in the rail and command header.
- “Signal line” accents: thin citron rules and tiny square nodes that mark active states.
- Execution Console: a dark graphite panel with monospaced telemetry and stage-aware progress.

### Interaction Philosophy
Interactions should expose state and reduce uncertainty. Buttons respond quickly, tabs change content without losing context, and scan actions surface simulated progress in the console instead of hiding behind a spinner. Focus rings are visible and keyboard order follows the visual hierarchy.

### Animation
Use short, snappy opacity and translate transitions under 240ms for tabs, cards, and list changes. On scan start, pipeline stages reveal sequentially with a subtle 60ms stagger; the console cursor uses a restrained pulse. Respect reduced motion by removing staged movement and keeping state changes immediate.

### Typography System
Use Space Grotesk for display labels and major numbers, IBM Plex Sans for interface copy, and IBM Plex Mono for timestamps, URLs, rule IDs, and console logs. Display headings are compact and slightly tracked; body text stays at 14–15px with generous line-height; metric values use tabular numerals.

### Brand Essence
AURA is the evidence-first accessibility operations workspace for product and engineering teams that need to find, fix, and prove WCAG compliance without losing technical context.
Personality: exacting, transparent, composed.

### Brand Voice
Headlines are direct and diagnostic. CTAs are verbs with a clear outcome. Microcopy explains what the system is doing and why it matters.
Example lines: “See the signal behind every issue.” “Run a scan and keep the evidence.”

### Wordmark & Logo
Use a compact uppercase AURA wordmark with custom spacing and a radar-eye mark to its left. The mark should never be reduced to a tiny generic favicon; keep it visible in the rail header and use the same asset as the favicon when possible.

### Signature Brand Color
Electric Citron — `#D7F24A` — used sparingly for active scan states, focus accents, and the primary “Start scan” action against dark graphite.

## Style Decisions

- The AURA mark should read as a technical radar-eye with arcs and a signal node; avoid mascot-like circular treatments as the brand evolves.
- Report routes must foreground evidence-led composition: executive summary, rule IDs, timestamps, issue density, affected elements, and remediation proof.
- Electric Citron remains reserved for active scan state, primary actions, signal rules/nodes, and key operational readings.
