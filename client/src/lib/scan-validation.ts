export type UrlValidationResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function normalizeScanUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a URL before starting the scan." };
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, message: "Use an HTTP or HTTPS URL." };
    }
    if (!parsed.hostname || parsed.hostname === "localhost" || !parsed.hostname.includes(".")) {
      return { ok: false, message: "Enter a complete public URL, such as https://example.com." };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, message: "Enter a valid URL, such as https://example.com." };
  }
}
