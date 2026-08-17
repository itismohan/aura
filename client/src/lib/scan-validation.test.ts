import { describe, expect, it } from "vitest";
import { normalizeScanUrl } from "./scan-validation";

describe("normalizeScanUrl", () => {
  it("rejects empty input before a mutation can be sent", () => {
    expect(normalizeScanUrl(" ")).toEqual({ ok: false, message: "Enter a URL before starting the scan." });
  });

  it("normalizes a bare public domain to HTTPS", () => {
    expect(normalizeScanUrl("example.com")).toEqual({ ok: true, value: "https://example.com/" });
  });

  it("accepts HTTP and HTTPS URLs", () => {
    expect(normalizeScanUrl("http://example.com/path")).toEqual({ ok: true, value: "http://example.com/path" });
  });

  it("rejects unsupported protocols and malformed or local hosts", () => {
    expect(normalizeScanUrl("ftp://example.com").ok).toBe(false);
    expect(normalizeScanUrl("not a url").ok).toBe(false);
    expect(normalizeScanUrl("http://localhost:3000").ok).toBe(false);
  });
});
