import type { ReportExportDetail } from "./pdf-export";
import { formatFindingId, formatReportId } from "../shared/report-format";

export { formatFindingId, formatReportId };

function impactForSeverity(severity: string) {
  if (severity === "critical") return "Blocks essential access and should be remediated immediately.";
  if (severity === "serious") return "Creates a significant barrier for some users and should be prioritized.";
  if (severity === "moderate") return "Degrades usability or clarity and should be addressed in the next remediation cycle.";
  return "Represents a lower-impact conformance gap that should be tracked to completion.";
}

function verificationForFinding(finding: ReportExportDetail["findings"][number]) {
  return finding.remediation
    ? "Apply the recommended remediation, then re-run AURA and confirm this selector no longer appears in the evidence set."
    : "Review the captured evidence, apply the appropriate WCAG-compliant correction, and re-run AURA to verify the result.";
}

function principleForRule(ruleId: string) {
  const prefix = ruleId.match(/(?:WCAG[- ]?)?(1|2|3|4)(?:\.|$)/i)?.[1];
  return prefix === "1" ? "Perceivable" : prefix === "2" ? "Operable" : prefix === "3" ? "Understandable" : prefix === "4" ? "Robust" : "WCAG";
}

function criterionForRule(ruleId: string) {
  return ruleId.match(/(\d+\.\d+\.\d+)/)?.[1] ?? ruleId;
}

export function buildDetailedReportExport(detail: ReportExportDetail) {
  const reportId = formatReportId(detail.report.id);
  const findings = detail.findings.map((finding, index) => ({
    id: formatFindingId(detail.job.id, index),
    ruleId: finding.ruleId,
    title: finding.title,
    severity: finding.severity,
    impact: impactForSeverity(finding.severity),
    description: finding.description,
    evidence: finding.evidence ?? null,
    selector: finding.selector ?? "document",
    remediation: finding.remediation ?? "Review the evidence and apply the recommended WCAG remediation.",
    verification: verificationForFinding(finding),
    standard: "WCAG 2.1 AA",
    wcagCriterion: criterionForRule(finding.ruleId),
    wcagPrinciple: principleForRule(finding.ruleId),
    workflow: {
      status: finding.workflow?.status ?? "open",
      acknowledgedAt: finding.workflow?.acknowledgedAt ?? null,
      inProgressAt: finding.workflow?.inProgressAt ?? null,
      verifiedAt: finding.workflow?.verifiedAt ?? null,
      closedAt: finding.workflow?.closedAt ?? null,
      updatedAt: finding.workflow?.updatedAt ?? null,
    },
  }));
  const totals = ["critical", "serious", "moderate", "minor"].reduce<Record<string, number>>((acc, severity) => {
    acc[severity] = findings.filter(finding => finding.severity === severity).length;
    return acc;
  }, {});
  const wcagMatrix = Object.values(findings.reduce<Record<string, { criterion: string; principle: string; issues: number; severities: string[] }>>((acc, finding) => {
    const key = `${finding.wcagCriterion}-${finding.wcagPrinciple}`;
    acc[key] ??= { criterion: finding.wcagCriterion, principle: finding.wcagPrinciple, issues: 0, severities: [] };
    acc[key].issues += 1;
    if (!acc[key].severities.includes(finding.severity)) acc[key].severities.push(finding.severity);
    return acc;
  }, {})).map((item) => ({
    successCriterion: item.criterion,
    principle: item.principle,
    status: "Findings recorded",
    issues: item.issues,
    severities: item.severities,
  }));
  const title = detail.report.title || detail.job.targetUrl;
  return {
    exportVersion: 3,
    reportId,
    title,
    exportedAt: new Date().toISOString(),
    report: {
      id: reportId,
      numericId: detail.report.id,
      title,
      summary: detail.report.summary,
      score: detail.report.score,
      status: detail.job.status,
      standard: "WCAG 2.1 AA",
      assessmentType: "Automated accessibility assessment",
      createdAt: detail.report.createdAt,
      completedAt: detail.job.completedAt ?? null,
    },
    executive: {
      healthIndicator: detail.report.score,
      healthIndicatorLabel: findings.length ? "Needs improvement" : "No recorded issues",
      totalFindings: findings.length,
      bySeverity: totals,
      passedChecks: null,
      manualReviewRequired: true,
      conformanceDisclaimer: "This aggregated indicator reflects automated findings and is not a WCAG conformance percentage.",
    },
    wcagAssessment: {
      standard: "WCAG 2.1 AA",
      status: findings.length ? "Partially conformant — automated assessment" : "No automated barriers recorded",
      matrix: wcagMatrix,
      disclaimer: "Statuses reflect automated evidence only. Manual review is required for criteria that cannot be reliably determined by scanning.",
    },
    adaReadiness: {
      indicator: detail.report.score,
      status: findings.length ? "Action recommended" : "No automated barriers recorded",
      disclaimer: "ADA is a legal framework rather than a technical testing specification. This indicator is not legal compliance certification.",
      manualReviewRequired: true,
    },
    manualReview: {
      required: true,
      limitations: [
        "Meaningful alternative text and context",
        "Logical reading order and understandable instructions",
        "Accurate captions and transcripts",
        "Intuitive keyboard interaction",
        "Meaningful error recovery",
      ],
      disclaimer: "AURA reports potential barriers; it does not certify ADA compliance.",
    },
    source: {
      target: detail.job.targetUrl,
      scanType: detail.job.scanType,
      status: detail.job.status,
      document: detail.document ? {
        filename: detail.document.filename,
        mimeType: detail.document.mimeType,
        byteSize: detail.document.byteSize,
      } : null,
    },
    inventory: {
      total: findings.length,
      bySeverity: totals,
      byWorkflowStatus: ["open", "acknowledged", "in_progress", "verified", "closed"].reduce<Record<string, number>>((acc, status) => {
        acc[status] = findings.filter(finding => finding.workflow.status === status).length;
        return acc;
      }, {}),
    },
    findings,
  };
}
