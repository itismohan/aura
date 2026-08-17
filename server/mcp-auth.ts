import crypto from "node:crypto";

function configuredToken() {
  return process.env.AURA_MCP_API_TOKEN?.trim() ?? "";
}

export function authenticateMcpToken(authorization: string | undefined) {
  const expected = configuredToken();
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length).trim();
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}
