import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getCrawlSessionForUser, getScanJobForUser, listCrawlEventsForUser, listScanEventsForUser } from "../db";
import { registerReportExportRoutes } from "../report-export-routes";
import { sdk } from "./sdk";
import { subscribeCrawlEvents } from "../crawl-events";
import { subscribeScanEvents } from "../scan-events";
import { registerMcpRoutes } from "../mcp-api";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerMcpRoutes(app);
  registerReportExportRoutes(app);
  app.get("/api/scans/:id/events", async (req, res) => {
    let user = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const scanJobId = Number(req.params.id);
    const ownedJob = await getScanJobForUser(scanJobId, user.id);
    if (!ownedJob) {
      res.status(404).json({ error: "Scan not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const writeScanEvent = (event: { stage: string; message: string; progress: number; status?: string }) => {
      res.write(`event: ${event.status ? "complete" : "scan"}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
        unsubscribe();
        res.end();
      }
    };
    const backlog = await listScanEventsForUser(scanJobId, user.id);
    const unsubscribe = subscribeScanEvents(scanJobId, writeScanEvent);
    req.on("close", unsubscribe);
    res.write(": connected\\n\\n");
    for (const event of backlog) writeScanEvent(event);
    const currentJob = await getScanJobForUser(scanJobId, user.id);
    if (currentJob?.status === "completed" || currentJob?.status === "failed" || currentJob?.status === "cancelled") {
      writeScanEvent({ stage: "complete", message: "Scan already finished", progress: 100, status: currentJob.status });
    }
  });

  app.get("/api/crawls/:sessionId/events", async (req, res) => {
    let user = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const sessionId = Number(req.params.sessionId);
    const owned = await getCrawlSessionForUser(sessionId, user.id);
    if (!owned) {
      res.status(404).json({ error: "Crawl session not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const writeCrawlEvent = (event: { type: string; sessionId: number; [key: string]: unknown }) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "state" && ["completed", "failed", "cancelled"].includes(String(event.status))) {
        unsubscribe();
        res.end();
      }
    };
    const backlog = await listCrawlEventsForUser(sessionId, user.id);
    const unsubscribe = subscribeCrawlEvents(sessionId, writeCrawlEvent);
    req.on("close", unsubscribe);
    res.write(": connected\\n\\n");
    for (const event of backlog) writeCrawlEvent({ type: "log", sessionId, stage: event.stage, message: event.message });
    if (["completed", "failed", "cancelled"].includes(owned.session.status)) {
      writeCrawlEvent({ type: "state", sessionId, status: owned.session.status, currentStep: owned.session.currentStep, currentUrl: owned.session.currentUrl ?? undefined });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
