import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reportViewSource = readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");

describe("report view fidelity guardrails", () => {
  it("renders the empty report state from persisted findings and has no sample page dataset", () => {
    expect(reportViewSource).toContain("const findings = detail?.findings ?? [];");
    expect(reportViewSource).toContain("No persisted accessibility errors");
    expect(reportViewSource).not.toContain("selectedPage");
    expect(reportViewSource).not.toContain("PageData");
    expect(reportViewSource).not.toContain("const pages");
    expect(reportViewSource).not.toContain("northstar.studio");
  });
});
