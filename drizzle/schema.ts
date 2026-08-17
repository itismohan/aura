import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scanRateLimits = mysqlTable("scan_rate_limits", {
  userId: int("userId").notNull().unique(),
  minuteBucket: int("minuteBucket").notNull(),
  count: int("count").notNull().default(0),
});

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scanJobs = mysqlTable("scan_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  targetUrl: varchar("targetUrl", { length: 2048 }).notNull(),
  scanType: mysqlEnum("scanType", ["url", "crawl", "document"]).default("url").notNull(),
  status: mysqlEnum("status", ["queued", "running", "paused", "completed", "failed", "cancelled"]).default("queued").notNull(),
  progress: int("progress").default(0).notNull(),
  score: int("score"),
  totalFindings: int("totalFindings").default(0).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
});

export const documentAssets = mysqlTable("document_assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  scanJobId: int("scanJobId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: text("storageUrl").notNull(),
  byteSize: int("byteSize").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scanFindings = mysqlTable("scan_findings", {
  id: int("id").autoincrement().primaryKey(),
  scanJobId: int("scanJobId").notNull(),
  ruleId: varchar("ruleId", { length: 64 }).notNull(),
  severity: mysqlEnum("severity", ["critical", "serious", "moderate", "minor"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  selector: text("selector"),
  evidence: text("evidence"),
  remediation: text("remediation"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Mutable triage workflow kept separate from immutable scan evidence. */
export const findingWorkflowStates = mysqlTable("finding_workflow_states", {
  id: int("id").autoincrement().primaryKey(),
  findingId: int("findingId").notNull().unique(),
  status: mysqlEnum("status", ["open", "acknowledged", "in_progress", "verified", "closed"]).default("open").notNull(),
  updatedBy: int("updatedBy").notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
  inProgressAt: timestamp("inProgressAt"),
  verifiedAt: timestamp("verifiedAt"),
  closedAt: timestamp("closedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const crawlPlans = mysqlTable("crawl_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  scanJobId: int("scanJobId").notNull().unique(),
  startUrl: varchar("startUrl", { length: 2048 }).notNull(),
  allowedUrlsJson: text("allowedUrlsJson").notNull(),
  stepsJson: text("stepsJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const crawlSessions = mysqlTable("crawl_sessions", {
  id: int("id").autoincrement().primaryKey(),
  scanJobId: int("scanJobId").notNull().unique(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["starting", "running", "takeover", "paused", "completed", "failed", "cancelled"]).default("starting").notNull(),
  currentStep: int("currentStep").default(0).notNull(),
  currentUrl: varchar("currentUrl", { length: 2048 }),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const crawlPages = mysqlTable("crawl_pages", {
  id: int("id").autoincrement().primaryKey(),
  scanJobId: int("scanJobId").notNull(),
  sessionId: int("sessionId").notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  title: varchar("title", { length: 255 }),
  findingCount: int("findingCount").default(0).notNull(),
  score: int("score"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const crawlEvents = mysqlTable("crawl_events", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  stage: varchar("stage", { length: 64 }).notNull(),
  message: text("message").notNull(),
  redacted: int("redacted").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const crawlStepHistory = mysqlTable("crawl_step_history", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  stepIndex: int("stepIndex").notNull(),
  stepType: varchar("stepType", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["started", "succeeded", "failed", "waiting"]).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  url: varchar("url", { length: 2048 }),
  detail: text("detail"),
  screenshotKey: varchar("screenshotKey", { length: 512 }),
  screenshotUrl: text("screenshotUrl"),
  selector: text("selector"),
  selectorMetadataJson: text("selectorMetadataJson"),
  domSnippet: text("domSnippet"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scanReports = mysqlTable("scan_reports", {
  id: int("id").autoincrement().primaryKey(),
  scanJobId: int("scanJobId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary").notNull(),
  score: int("score").notNull(),
  snapshotJson: text("snapshotJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scanEvents = mysqlTable("scan_events", {
  id: int("id").autoincrement().primaryKey(),
  scanJobId: int("scanJobId").notNull(),
  stage: varchar("stage", { length: 64 }).notNull(),
  message: text("message").notNull(),
  progress: int("progress").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type ScanRateLimit = typeof scanRateLimits.$inferSelect;
export type ScanJob = typeof scanJobs.$inferSelect;
export type DocumentAsset = typeof documentAssets.$inferSelect;
export type CrawlPlan = typeof crawlPlans.$inferSelect;
export type CrawlSession = typeof crawlSessions.$inferSelect;
export type CrawlPage = typeof crawlPages.$inferSelect;
export type CrawlEvent = typeof crawlEvents.$inferSelect;
export type CrawlStepHistory = typeof crawlStepHistory.$inferSelect;
export type ScanReport = typeof scanReports.$inferSelect;
export type ScanFinding = typeof scanFindings.$inferSelect;
export type FindingWorkflowState = typeof findingWorkflowStates.$inferSelect;
export type ScanEvent = typeof scanEvents.$inferSelect;
