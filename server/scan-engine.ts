import dns from "node:dns/promises";
import net from "node:net";
import { scanFindings } from '../drizzle/schema';

export type ScanProgress = (stage: string, message: string, progress: number) => Promise<void>;

export type DetectedFinding = Pick<typeof scanFindings.$inferInsert, "ruleId" | "severity" | "title" | "description" | "selector" | "evidence" | "remediation">;

export function sniffDocumentContent(bytes: Buffer, extension: string) {
  if (!bytes.length) throw new Error('The uploaded document is empty.');
  if (bytes.subarray(0, 4).toString('ascii') === '%PDF' || bytes.subarray(0, 2).toString('ascii') === 'PK') {
    throw new Error('Binary office and PDF documents are not supported in this beta.');
  }
  const text = bytes.toString('utf8');
  if (text.includes("\uFFFD") || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
    throw new Error('The uploaded file contains binary or invalid text content.');
  }
  const trimmed = text.trim();
  if (extension === 'json') {
    try { JSON.parse(trimmed); } catch { throw new Error('The uploaded file is not valid JSON.'); }
  }
  if (extension === 'html' || extension === 'htm') {
    if (!/<(?:!doctype\s+html|html\b|body\b|head\b|main\b)/i.test(trimmed)) throw new Error('The uploaded HTML file failed content sniffing.');
  }
  if (extension === 'csv' && !(/[\\n,;\\t]/.test(trimmed))) throw new Error('The uploaded CSV file failed content sniffing.');
  return text;
}

export function validateTargetUrl(value: string) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credential-bearing URLs are not allowed.');
  }
  return parsed.toString();
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
}

export async function assertPublicTarget(url: string) {
  const hostname = new URL(url).hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Local network targets are not allowed.");
  const records = await dns.lookup(hostname, { all: true });
  if (records.some((record) => isPrivateAddress(record.address))) throw new Error("Private or loopback network targets are not allowed.");
}

function countMatches(html: string, pattern: RegExp) {
  return Array.from(html.matchAll(pattern)).length;
}

export function analyzeHtml(html: string): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const imagesWithoutAlt = countMatches(html, /<img\b(?![^>]*\balt\s*=)[^>]*>/gi);
  const linksWithoutName = countMatches(html, /<a\b[^>]*>\s*(?:<[^>]+>\s*)*<\/a>/gi);
  const buttonsWithoutName = countMatches(html, /<button\b[^>]*>\s*(?:<[^>]+>\s*)*<\/button>/gi);
  const missingLang = !/<html\b[^>]*\blang\s*=/i.test(html);
  const missingTitle = !/<title\b[^>]*>\s*[^<]+\s*<\/title>/i.test(html);

  if (imagesWithoutAlt > 0) {
    findings.push({
      ruleId: '1.1.1', severity: 'serious', title: 'Non-text content is missing alternative text',
      description: `${imagesWithoutAlt} image element${imagesWithoutAlt === 1 ? '' : 's'} do not expose an alt attribute.`,
      selector: 'img:not([alt])', evidence: `${imagesWithoutAlt} matching element${imagesWithoutAlt === 1 ? '' : 's'}.`,
      remediation: 'Add concise alt text or mark decorative images with an empty alt attribute.',
    });
  }
  if (missingLang) {
    findings.push({
      ruleId: '3.1.1', severity: 'moderate', title: 'Page language is not declared',
      description: 'The root html element does not declare a lang attribute.', selector: 'html', evidence: '<html> has no lang attribute.',
      remediation: 'Add a valid language code such as lang="en" to the root html element.',
    });
  }
  if (missingTitle) {
    findings.push({
      ruleId: '2.4.2', severity: 'serious', title: 'Page is missing a descriptive title',
      description: 'The document does not contain a non-empty title element.', selector: 'head > title', evidence: 'No usable <title> element found.',
      remediation: 'Add a concise title that identifies the page and its purpose.',
    });
  }
  if (linksWithoutName > 0) {
    findings.push({
      ruleId: '2.4.4', severity: 'moderate', title: 'Links do not have an accessible name',
      description: `${linksWithoutName} link${linksWithoutName === 1 ? '' : 's'} contain no discernible text.`, selector: 'a', evidence: `${linksWithoutName} empty link candidate${linksWithoutName === 1 ? '' : 's'}.`,
      remediation: 'Provide visible link text or an accessible aria-label.',
    });
  }
  if (buttonsWithoutName > 0) {
    findings.push({
      ruleId: '4.1.2', severity: 'serious', title: 'Buttons do not have an accessible name',
      description: `${buttonsWithoutName} button${buttonsWithoutName === 1 ? '' : 's'} contain no discernible text.`, selector: 'button', evidence: `${buttonsWithoutName} empty button candidate${buttonsWithoutName === 1 ? '' : 's'}.`,
      remediation: 'Add visible button text or an accessible aria-label.',
    });
  }
  return findings;
}

function analyzeTextDocument(content: string, extension: string): DetectedFinding[] {
  const findings: DetectedFinding[] = [];
  const lines = content.split(/\r?\n/);
  const hasHeading = extension === 'md'
    ? lines.some((line) => /^#{1,6}\s+\S/.test(line))
    : /(?:^|\n)\s*(?:title|heading|name)\s*[:;,]/i.test(content);
  if (!hasHeading) {
    findings.push({
      ruleId: '2.4.6', severity: 'moderate', title: 'Document structure is missing a clear heading',
      description: 'The document does not expose a detectable title or heading structure for assistive technology users.',
      selector: extension === 'md' ? 'markdown heading' : 'document metadata', evidence: 'No heading-like structure detected.',
      remediation: 'Add a descriptive title and organize content with a logical heading hierarchy.',
    });
  }
  if (extension === 'md' && /!\[[^\]]*\]\([^)]*\)/.test(content) && /!\[\s*\]/.test(content)) {
    findings.push({
      ruleId: '1.1.1', severity: 'serious', title: 'Markdown image is missing alternative text',
      description: 'One or more Markdown images have empty alternative text.', selector: 'markdown image', evidence: 'Detected an image with empty alt text.',
      remediation: 'Describe meaningful images or mark decorative images intentionally.',
    });
  }
  if (extension === 'json') {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed as Record<string, unknown>).length === 0) {
        findings.push({
          ruleId: '3.3.2', severity: 'minor', title: 'JSON document has no accessible metadata',
          description: 'The JSON object is empty and does not provide a machine-readable title or description.', selector: 'root object', evidence: '{}',
          remediation: 'Include a descriptive name or metadata field for downstream users and integrations.',
        });
      }
    } catch {
      // Content sniffing validates JSON before this stage.
    }
  }
  return findings;
}

export async function runDocumentScan(content: string, filename: string, onProgress: ScanProgress) {
  await onProgress('discover', `Preparing ${filename}`, 10);
  if (!content.trim()) throw new Error('The uploaded document is empty.');
  await onProgress('capture', 'Reading document content', 40);
  const extension = filename.toLowerCase().split('.').pop() ?? 'txt';
  const findings = extension === 'html' || extension === 'htm' ? analyzeHtml(content) : analyzeTextDocument(content, extension);
  await onProgress('analyze', 'Evaluating document evidence against core WCAG rules', 70);
  await onProgress('report', `Collected ${findings.length} evidence-backed finding${findings.length === 1 ? '' : 's'}`, 92);
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + ({ critical: 25, serious: 15, moderate: 8, minor: 3 }[finding.severity] ?? 0), 0));
  return { url: filename, findings, score, title: filename };
}

export async function runUrlScan(targetUrl: string, onProgress: ScanProgress) {
  const url = validateTargetUrl(targetUrl);
  await onProgress('discover', 'Validating target URL', 10);
  await assertPublicTarget(url);
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, { headers: { 'user-agent': 'AURA-Accessibility-Scanner/1.0' }, redirect: 'follow', signal: timeout });
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 5_000_000) throw new Error('Target response exceeds the 5 MB scan limit.');
  if (!response.ok) throw new Error(`Target returned HTTP ${response.status}.`);
  await onProgress('capture', 'Downloading and capturing HTML', 40);
  const html = await response.text();
  await onProgress('analyze', 'Evaluating evidence against core WCAG rules', 70);
  const findings = analyzeHtml(html);
  await onProgress('report', `Collected ${findings.length} evidence-backed finding${findings.length === 1 ? '' : 's'}`, 92);
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + ({ critical: 25, serious: 15, moderate: 8, minor: 3 }[finding.severity] ?? 0), 0));
  return { url, findings, score, title: (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? url).trim() };
}
