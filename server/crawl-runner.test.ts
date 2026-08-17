import { describe, expect, it } from "vitest";
import { sanitizeDomSnippet, validateCrawlPlan, MAX_DOM_SNIPPET_CHARS, type CrawlStep } from "./crawl-runner";
import { assertPublicTarget } from "./scan-engine";

describe("authenticated crawl plan validation", () => {
  const baseSteps: CrawlStep[] = [
    { type: "open", url: "https://example.com/" },
    { type: "fill", selector: "input[name=username]", credential: "username" },
    { type: "mfa_checkpoint", label: "Complete MFA if prompted" },
    { type: "scan_page" },
  ];

  it("accepts an explicit same-origin plan", () => {
    expect(validateCrawlPlan({
      startUrl: "https://example.com",
      allowedUrls: ["https://example.com/", "https://example.com/account"],
      steps: baseSteps,
    })).toEqual({ startUrl: "https://example.com/", stepCount: 4 });
  });

  it("rejects navigation outside the approved origin or allowlist", () => {
    expect(() => validateCrawlPlan({
      startUrl: "https://example.com/",
      allowedUrls: ["https://example.com/"],
      steps: [{ type: "open", url: "https://evil.example/" }],
    })).toThrow(/origin|allowlist/);
  });

  it("rejects empty allowlists and unlabeled MFA checkpoints", () => {
    expect(() => validateCrawlPlan({ startUrl: "https://example.com/", allowedUrls: [], steps: baseSteps })).toThrow(/approved URL/);
    expect(() => validateCrawlPlan({
      startUrl: "https://example.com/",
      allowedUrls: ["https://example.com/"],
      steps: [{ type: "mfa_checkpoint", label: " " }],
    })).toThrow(/label/);
  });

  it("rejects local and loopback browser targets before launch", async () => {
    await expect(assertPublicTarget("http://localhost/login")).rejects.toThrow(/Local network/);
    await expect(assertPublicTarget("http://127.0.0.1/login")).rejects.toThrow(/Private or loopback/);
  });

  it("redacts active content, sensitive attributes, credentials, and bounds DOM evidence", () => {
    const snippet = sanitizeDomSnippet('<html><script>window.secret="keep-out"</script><style>.x{}</style><body><input value="hunter2" aria-label="Password" data-token="abc"><div>password: hunter2 token=abc</div></body></html>');
    expect(snippet).not.toContain("window.secret");
    expect(snippet).not.toContain("hunter2");
    expect(snippet).not.toContain("token=abc");
    expect(snippet).toContain('value="[redacted]"');
    expect(snippet.length).toBeLessThanOrEqual(MAX_DOM_SNIPPET_CHARS);
    expect(sanitizeDomSnippet(`<div>${"x".repeat(MAX_DOM_SNIPPET_CHARS + 500)}</div>`)).toHaveLength(MAX_DOM_SNIPPET_CHARS);
  });

  it("rejects invalid wait durations and oversized plans", () => {
    expect(() => validateCrawlPlan({
      startUrl: "https://example.com/",
      allowedUrls: ["https://example.com/"],
      steps: [{ type: "wait", milliseconds: -1 }],
    })).toThrow(/duration/);
    expect(() => validateCrawlPlan({
      startUrl: "https://example.com/",
      allowedUrls: ["https://example.com/"],
      steps: Array.from({ length: 51 }, () => ({ type: "scan_page" as const })),
    })).toThrow(/between 1 and 50/);
  });
});
