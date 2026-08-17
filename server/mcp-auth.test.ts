import { describe, expect, it } from "vitest";
import { authenticateMcpToken } from "./mcp-auth";

describe("MCP bearer authentication", () => {
  it("accepts the configured token and rejects missing or incorrect authorization", () => {
    const configured = process.env.AURA_MCP_API_TOKEN;
    expect(configured).toBeTruthy();
    expect(authenticateMcpToken(`Bearer ${configured}`)).toBe(true);
    expect(authenticateMcpToken("Bearer invalid-token")).toBe(false);
    expect(authenticateMcpToken(undefined)).toBe(false);
  });
});
