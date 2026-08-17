import type { Express, Request, Response } from "express";
import { getReportDetailForUser } from "./db";
import { renderReportPdf } from "./pdf-export";
import { createContext } from "./_core/context";
import { buildDetailedReportExport, formatReportId } from "./report-export";

async function authenticate(req: Request, res: Response) {
  const context = await createContext({ req, res } as never);
  if (!context.user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return context.user;
}

export function registerReportExportRoutes(app: Express) {
  app.get("/api/reports/:id/export.json", async (req, res) => {
    const user = await authenticate(req, res);
    if (!user) return;
    const report = await getReportDetailForUser(Number(req.params.id), user.id);
    if (!report) return void res.status(404).json({ error: "Report not found" });
    const payload = buildDetailedReportExport(report);
    res.setHeader("Content-Disposition", `attachment; filename="${formatReportId(report.report.id)}.json"`);
    res.type("application/json").send(JSON.stringify(payload, null, 2));
  });
  app.get("/api/reports/:id/export.pdf", async (req, res) => {
    const user = await authenticate(req, res);
    if (!user) return;
    const report = await getReportDetailForUser(Number(req.params.id), user.id);
    if (!report) return void res.status(404).json({ error: "Report not found" });
    const pdf = await renderReportPdf(report);
    res.setHeader("Content-Disposition", `attachment; filename="${formatReportId(report.report.id)}.pdf"`);
    res.type("application/pdf").send(pdf);
  });
}
