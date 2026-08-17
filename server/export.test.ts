import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderReportPdf, type ReportExportDetail } from "./pdf-export";
import { buildDetailedReportExport } from "./report-export";

describe("report exports", () => {
  const detail: ReportExportDetail = {
    report: { id: 12, title: "AURA fixture report", summary: "Fixture accessibility summary", score: 72, createdAt: "2026-08-16T10:00:00.000Z", snapshotJson: null },
    job: { id: 34, targetUrl: "https://example.com", scanType: "url", status: "completed", totalFindings: 1, createdAt: "2026-08-16T09:59:00.000Z", completedAt: "2026-08-16T10:01:00.000Z" },
    findings: [{ ruleId: "WCAG-1.4.3", title: "Contrast (Minimum)", severity: "serious", selector: "button.cta", description: "Contrast is below the required threshold.", evidence: "button.cta", remediation: "Increase the foreground/background contrast.", workflow: { status: "in_progress", acknowledgedAt: "2026-08-16T10:02:00.000Z", inProgressAt: "2026-08-16T10:03:00.000Z", verifiedAt: null, closedAt: null, updatedAt: "2026-08-16T10:03:00.000Z" } }],
    document: null,
  };

  it("renders a valid PDF document", async () => {
    const pdf = await renderReportPdf(detail);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("%%EOF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });

  it("includes workflow lifecycle timestamps in the PDF text", async () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-export-"));
    const pdfPath = join(directory, "report.pdf");
    const textPath = join(directory, "report.txt");
    try {
      writeFileSync(pdfPath, await renderReportPdf(detail));
      execFileSync("pdftotext", [pdfPath, textPath]);
      const text = readFileSync(textPath, "utf8");
      expect(text).toContain("In progress");
      expect(text).toContain("Acknowledged");
      expect(text).toContain("Aug 16, 2026");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the JSON export contract complete and serializable", () => {
    const parsed = JSON.parse(JSON.stringify(buildDetailedReportExport(detail)));
    expect(parsed.exportVersion).toBe(3);
    expect(parsed.reportId).toBe("AURA-RPT-000012");
    expect(parsed.report.title).toBe("AURA fixture report");
    expect(parsed.findings[0].id).toBe("AURA-FND-000034-001");
    expect(parsed.findings[0].ruleId).toBe("WCAG-1.4.3");
    expect(parsed.findings[0].impact).toContain("significant barrier");
    expect(parsed.findings[0].verification).toContain("re-run AURA");
    expect(parsed.findings[0].workflow.status).toBe("in_progress");
    expect(parsed.inventory.byWorkflowStatus).toEqual({ open: 0, acknowledged: 0, in_progress: 1, verified: 0, closed: 0 });
    expect(parsed.source.target).toBe("https://example.com");
    expect(parsed.executive.healthIndicator).toBe(72);
    expect(parsed.executive.manualReviewRequired).toBe(true);
    expect(parsed.executive.conformanceDisclaimer).toContain("not a WCAG conformance percentage");
    expect(parsed.wcagAssessment.matrix).toEqual([{ successCriterion: "1.4.3", principle: "Perceivable", status: "Findings recorded", issues: 1, severities: ["serious"] }]);
    expect(parsed.adaReadiness.disclaimer).toContain("not legal compliance certification");
    expect(parsed.manualReview.disclaimer).toContain("does not certify ADA compliance");
  });

  it("preserves an actually clean report without fabricated findings", () => {
    const clean = buildDetailedReportExport({
      ...detail,
      report: { ...detail.report, id: 13, title: "Clean persisted report", score: 100 },
      job: { ...detail.job, id: 35, totalFindings: 0 },
      findings: [],
    });
    expect(clean.inventory.total).toBe(0);
    expect(clean.inventory.bySeverity).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
    expect(clean.inventory.byWorkflowStatus).toEqual({ open: 0, acknowledged: 0, in_progress: 0, verified: 0, closed: 0 });
    expect(clean.findings).toEqual([]);
    expect(clean.executive.healthIndicatorLabel).toBe("No recorded issues");
    expect(clean.wcagAssessment.matrix).toEqual([]);
    expect(clean.adaReadiness.status).toBe("No automated barriers recorded");
  });
});
