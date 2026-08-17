import { describe, expect, it } from "vitest";
import { analyzeHtml, runDocumentScan, sniffDocumentContent, validateTargetUrl } from "./scan-engine";

describe("scan engine", () => {
  it("accepts public HTTP URLs and rejects credential-bearing targets", () => {
    expect(validateTargetUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(() => validateTargetUrl("file:///tmp/page.html")).toThrow(/http and https/);
    expect(() => validateTargetUrl("https://user:pass@example.com")).toThrow(/Credential-bearing/);
  });

  it("detects evidence-backed document accessibility issues", () => {
    const findings = analyzeHtml('<html><head></head><body><img src="hero.jpg"><a href="/next"></a><button></button></body></html>');
    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining(["1.1.1", "3.1.1", "2.4.2", "2.4.4", "4.1.2"]));
    expect(findings.every((finding) => finding.evidence && finding.remediation)).toBe(true);
  });

  it("returns no findings for the core checks when markup is complete", () => {
    expect(analyzeHtml('<html lang="en"><head><title>Accessible page</title></head><body><img alt="A diagram" src="diagram.svg"><a href="/next">Next page</a><button>Save</button></body></html>')).toHaveLength(0);
  });

  it("sniffs supported document content and rejects unsafe payloads", () => {
    expect(sniffDocumentContent(Buffer.from('{"name":"AURA"}'), "json")).toContain('AURA');
    expect(() => sniffDocumentContent(Buffer.from('{invalid'), "json")).toThrow(/valid JSON/);
    expect(sniffDocumentContent(Buffer.from('<!doctype html><html><body>AURA</body></html>'), "html")).toContain('AURA');
    expect(() => sniffDocumentContent(Buffer.from('%PDF-1.7'), "txt")).toThrow(/Binary/);
    expect(() => sniffDocumentContent(Buffer.from('plain text'), "html")).toThrow(/HTML/);
  });

  it("produces evidence-backed findings for non-HTML documents", async () => {
    const markdown = await runDocumentScan('![ ](hero.png)\nBody text', 'audit.md', async () => undefined);
    expect(markdown.findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining(['2.4.6', '1.1.1']));

    const json = await runDocumentScan('{}', 'metadata.json', async () => undefined);
    expect(json.findings.map((finding) => finding.ruleId)).toContain('2.4.6');
  });
});
