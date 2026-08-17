import PDFDocument from "pdfkit";
import { buildDetailedReportExport } from "./report-export";

export type ReportExportDetail = {
  report: {
    id: number;
    title: string;
    summary: string;
    score: number;
    createdAt: Date | string;
    snapshotJson?: string | null;
  };
  job: {
    id: number;
    targetUrl: string;
    scanType: string;
    status: string;
    totalFindings: number;
    createdAt: Date | string;
    completedAt?: Date | string | null;
  };
  findings: Array<{
    id?: number;
    ruleId: string;
    title: string;
    severity: string;
    selector?: string | null;
    description: string;
    evidence?: string | null;
    remediation?: string | null;
    workflow?: {
      status: "open" | "acknowledged" | "in_progress" | "verified" | "closed";
      acknowledgedAt?: Date | string | null;
      inProgressAt?: Date | string | null;
      verifiedAt?: Date | string | null;
      closedAt?: Date | string | null;
      updatedAt?: Date | string | null;
    } | null;
  }>;
  document?: {
    filename: string;
    mimeType: string;
    byteSize: number;
  } | null;
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return `${new Date(value).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`;
}

function severityColor(severity: string) {
  if (severity === "critical") return "#D9584D";
  if (severity === "serious") return "#D9894A";
  if (severity === "moderate") return "#D0AD3C";
  return "#5B88A8";
}

function workflowLabel(status: string) {
  return status.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeText(value: unknown) {
  return String(value ?? "—").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function renderReportPdf(detail: ReportExportDetail): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const exportData = buildDetailedReportExport(detail);
    const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, info: { Title: `AURA report — ${exportData.reportId}`, Author: "AURA Accessibility Operations", Subject: "WCAG 2.1 AA accessibility assessment" } });
    const chunks: Buffer[] = [];
    const graphite = "#1B2421";
    const citron = "#D7F24A";
    const ivory = "#F7F5EF";
    const muted = "#6F7973";
    const line = "#DDE1D8";
    const width = 511;

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.rect(0, 0, 595, 842).fill(ivory);

    const footer = () => {
      doc.save().fillColor(muted).font("Helvetica").fontSize(7).text(`${exportData.reportId}  ·  AURA Accessibility Unified Reporting & Analysis`, 42, 808, { width, align: "left" }).text(`Page ${doc.bufferedPageRange().count}`, 42, 808, { width, align: "right" }).restore();
    };
    const pageHeader = () => {
      doc.save().fillColor(graphite).rect(0, 0, 595, 62).fill().fillColor(citron).rect(42, 25, 22, 3).fill().fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(17).text("AURA", 76, 19).font("Helvetica").fontSize(7).text("ACCESSIBILITY UNIFIED REPORTING & ANALYSIS", 76, 39).restore();
    };
    const ensureSpace = (needed = 90) => {
      if (doc.y + needed > 785) {
        footer();
        doc.addPage();
        doc.rect(0, 0, 595, 842).fill(ivory);
        pageHeader();
        doc.y = 88;
      }
    };
    const sectionLabel = (label: string) => {
      ensureSpace(30);
      doc.fillColor(citron).rect(42, doc.y + 4, 18, 2).fill();
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text(label.toUpperCase(), 70, doc.y);
      doc.moveDown(0.7);
    };
    const card = (x: number, y: number, w: number, h: number) => {
      doc.save().fillColor("#FFFFFF").strokeColor(line).lineWidth(0.7).roundedRect(x, y, w, h, 4).fillAndStroke().restore();
    };

    pageHeader();
    doc.y = 94;
    sectionLabel("Accessibility assessment");
    doc.fillColor(graphite).font("Helvetica-Bold").fontSize(23).text(safeText(exportData.title), 42, doc.y, { width: width - 170 });
    doc.fillColor(muted).font("Helvetica").fontSize(9).text(`${exportData.reportId}  ·  ${safeText(exportData.source.target)}`, 42, doc.y + 7, { width });
    doc.y += 28;

    const summaryTop = doc.y;
    card(42, summaryTop, 244, 112);
    card(298, summaryTop, 255, 112);
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("OVERALL SCORE", 58, summaryTop + 16);
    doc.fillColor(graphite).font("Helvetica-Bold").fontSize(30).text(`${exportData.report.score}`, 58, summaryTop + 30);
    doc.fillColor(muted).font("Helvetica").fontSize(9).text("/ 100  ·  WCAG 2.1 AA", 112, summaryTop + 48);
    doc.fillColor(exportData.report.score >= 85 ? "#7D9C20" : "#B27A2D").font("Helvetica-Bold").fontSize(9).text(exportData.report.score >= 85 ? "Good foundation" : "Needs improvement", 58, summaryTop + 78);
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("Resolve the highest-impact findings to raise the pass rate.", 58, summaryTop + 92, { width: 210 });
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("REPORT SNAPSHOT", 314, summaryTop + 16);
    doc.fillColor(graphite).font("Helvetica-Bold").fontSize(12).text(exportData.report.status.toUpperCase(), 314, summaryTop + 31);
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(`Created  ${formatDate(exportData.report.createdAt)}`, 314, summaryTop + 56);
    doc.text(`Completed  ${formatDate(exportData.report.completedAt)}`, 314, summaryTop + 70);
    doc.text(`Findings  ${exportData.inventory.total}`, 314, summaryTop + 84);
    doc.y = summaryTop + 138;

    sectionLabel("Issue inventory");
    const counts = ["critical", "serious", "moderate", "minor"];
    const inventoryTop = doc.y;
    counts.forEach((severity, index) => {
      const x = 42 + index * 128;
      card(x, inventoryTop, 116, 58);
      doc.fillColor(severityColor(severity)).rect(x + 12, inventoryTop + 15, 7, 7).fill();
      doc.fillColor(muted).font("Helvetica").fontSize(8).text(severity[0].toUpperCase() + severity.slice(1), x + 27, inventoryTop + 13);
      doc.fillColor(graphite).font("Helvetica-Bold").fontSize(15).text(String(exportData.inventory.bySeverity[severity] ?? 0), x + 12, inventoryTop + 30);
    });
    doc.y = inventoryTop + 80;

    sectionLabel("WCAG 2.1 AA assessment");
    card(42, doc.y, 244, 88);
    card(298, doc.y, 255, 88);
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("AUTOMATED ASSESSMENT", 58, doc.y + 15);
    doc.fillColor(graphite).font("Helvetica-Bold").fontSize(11).text(safeText(exportData.wcagAssessment.status), 58, doc.y + 30, { width: 215 });
    doc.fillColor(muted).font("Helvetica").fontSize(8).text("Manual review is required for criteria that cannot be reliably determined by scanning.", 58, doc.y + 59, { width: 215 });
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("ADA ACCESSIBILITY READINESS", 314, doc.y + 15);
    doc.fillColor(graphite).font("Helvetica-Bold").fontSize(19).text(`${exportData.adaReadiness.indicator} / 100`, 314, doc.y + 30);
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(safeText(exportData.adaReadiness.status), 314, doc.y + 59);
    doc.y += 108;

    sectionLabel("Compliance matrix and manual review");
    if (exportData.wcagAssessment.matrix.length === 0) {
      card(42, doc.y, width, 42);
      doc.fillColor(muted).font("Helvetica").fontSize(9).text("No persisted WCAG success criteria were recorded for this assessment.", 58, doc.y + 16);
      doc.y += 62;
    } else {
      exportData.wcagAssessment.matrix.forEach((item) => {
        ensureSpace(34);
        card(42, doc.y, width, 30);
        doc.fillColor(graphite).font("Helvetica-Bold").fontSize(8).text(safeText(item.successCriterion), 56, doc.y + 10);
        doc.fillColor(muted).font("Helvetica").fontSize(8).text(safeText(item.principle), 130, doc.y + 10);
        doc.fillColor("#9A4C3E").font("Helvetica-Bold").fontSize(8).text(safeText(item.status), 250, doc.y + 10);
        doc.fillColor(muted).font("Helvetica").fontSize(8).text(`${item.issues} issue(s)`, 470, doc.y + 10);
        doc.y += 38;
      });
    }
    doc.fillColor(muted).font("Helvetica").fontSize(8).text(safeText(exportData.manualReview.disclaimer), 42, doc.y, { width });
    doc.y += 25;

    sectionLabel("Report source and evidence");
    card(42, doc.y, width, exportData.source.document ? 82 : 55);
    const sourceTop = doc.y;
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("TARGET", 58, sourceTop + 15);
    doc.fillColor(graphite).font("Helvetica").fontSize(9).text(safeText(exportData.source.target), 58, sourceTop + 29, { width: 220 });
    doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("SCAN TYPE", 320, sourceTop + 15);
    doc.fillColor(graphite).font("Helvetica").fontSize(9).text(safeText(exportData.source.scanType).toUpperCase(), 320, sourceTop + 29);
    if (exportData.source.document) {
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text("DOCUMENT EVIDENCE", 58, sourceTop + 53);
      doc.fillColor(graphite).font("Helvetica").fontSize(9).text(`${safeText(exportData.source.document.filename)}  ·  ${exportData.source.document.byteSize.toLocaleString()} bytes  ·  ${safeText(exportData.source.document.mimeType)}`, 58, sourceTop + 66, { width: 460 });
    }
    doc.y = sourceTop + (exportData.source.document ? 108 : 80);

    if (exportData.findings.length > 0) ensureSpace(360);
    sectionLabel(`Detailed issue queue / ${exportData.inventory.total} findings`);
    if (exportData.findings.length === 0) {
      card(42, doc.y, width, 50);
      doc.fillColor(muted).font("Helvetica").fontSize(10).text("No accessibility findings were recorded for this assessment.", 58, doc.y + 19);
      doc.y += 74;
    }
    exportData.findings.forEach((finding) => {
      ensureSpace(330);
      const top = doc.y;
      const title = `${finding.id}  ·  ${finding.ruleId}  ·  ${finding.severity.toUpperCase()}`;
      doc.fillColor(severityColor(finding.severity)).rect(42, top, 5, 24).fill();
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(8).text(title, 58, top + 2, { width: 360 });
      doc.fillColor(finding.workflow.status === "closed" || finding.workflow.status === "verified" ? "#5D8B57" : "#8A7724").font("Helvetica-Bold").fontSize(8).text(workflowLabel(finding.workflow.status), 432, top + 2, { width: 105, align: "right" });
      doc.fillColor(graphite).font("Helvetica-Bold").fontSize(12).text(safeText(finding.title), 58, top + 17, { width: 470 });
      const lifecycle = [
        ["Acknowledged", finding.workflow.acknowledgedAt],
        ["In progress", finding.workflow.inProgressAt],
        ["Verified", finding.workflow.verifiedAt],
        ["Closed", finding.workflow.closedAt],
      ].filter(([, timestamp]) => timestamp).map(([label, timestamp]) => `${label}: ${formatDate(timestamp)}`).join("  ·  ");
      doc.fillColor(muted).font("Helvetica").fontSize(7).text(lifecycle || "No workflow transitions recorded", 58, top + 34, { width: 479, height: 10, ellipsis: true });
      doc.y = top + 57;
      const selectorTop = doc.y;
      card(58, selectorTop, 479, 18);
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text("SELECTOR", 70, selectorTop + 6);
      doc.fillColor(graphite).font("Courier").fontSize(8).text(safeText(finding.selector), 125, selectorTop + 5, { width: 395, height: 10, ellipsis: true });
      doc.y = selectorTop + 30;
      const detailTop = doc.y;
      const detailHeight = 78;
      card(58, detailTop, 230, detailHeight);
      card(307, detailTop, 230, detailHeight);
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text("WHAT WAS FOUND", 70, detailTop + 12);
      doc.fillColor(graphite).font("Helvetica").fontSize(8).text(safeText(finding.description), 70, detailTop + 27, { width: 205, height: 39 });
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text("WHY IT MATTERS", 319, detailTop + 12);
      doc.fillColor(graphite).font("Helvetica").fontSize(8).text(safeText(finding.impact), 319, detailTop + 27, { width: 205, height: 39 });
      doc.y = detailTop + detailHeight + 10;
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text("CAPTURED EVIDENCE", 58, doc.y);
      doc.fillColor(graphite).font("Courier").fontSize(8).text(safeText(finding.evidence), 58, doc.y + 11, { width: 479, height: 28, ellipsis: true });
      doc.y += 38;
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text("REMEDIATION", 58, doc.y);
      doc.fillColor(graphite).font("Helvetica").fontSize(8).text(safeText(finding.remediation), 58, doc.y + 11, { width: 479, height: 30 });
      doc.y += 41;
      doc.fillColor(muted).font("Helvetica-Bold").fontSize(7).text("VERIFY", 58, doc.y);
      doc.fillColor(graphite).font("Helvetica").fontSize(8).text(safeText(finding.verification), 97, doc.y, { width: 440 });
      doc.y += 27;
      doc.strokeColor(line).lineWidth(0.6).moveTo(42, doc.y).lineTo(553, doc.y).stroke();
      doc.y += 16;
    });

    footer();
    doc.end();
  });
}
