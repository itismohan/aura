import { describe, expect, it } from "vitest";
import { scanQuotaMessage, shouldConsumeScanQuota } from "./scan-quota";

describe("scan quota policy", () => {
  it("does not throttle the explicit development mock session in development", () => {
    expect(shouldConsumeScanQuota({ loginMethod: "development-mock" }, "development")).toBe(false);
  });

  it("keeps the mock session subject to quota outside development", () => {
    expect(shouldConsumeScanQuota({ loginMethod: "development-mock" }, "production")).toBe(true);
  });

  it("keeps regular users subject to quota in every environment", () => {
    expect(shouldConsumeScanQuota({ loginMethod: "manus-oauth" }, "development")).toBe(true);
    expect(shouldConsumeScanQuota({ loginMethod: null }, "production")).toBe(true);
  });

  it("provides the stable public-facing limit message", () => {
    expect(scanQuotaMessage()).toContain("wait a minute");
  });
});
