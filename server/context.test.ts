import { afterEach, describe, expect, it } from "vitest";
import { createContext } from "./_core/context";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("development mock authentication", () => {
  it("creates a local smoke-test user only for the explicit development header", async () => {
    process.env.NODE_ENV = "development";
    const context = await createContext({
      req: { headers: { "x-aura-mock-session": "aura-local-smoke-test" } } as never,
      res: {} as never,
    });
    expect(context.user).toMatchObject({ id: 1, openId: "aura-local-smoke-user", loginMethod: "development-mock" });
  });

  it("does not accept the mock header in production mode", async () => {
    process.env.NODE_ENV = "production";
    const context = await createContext({
      req: { headers: { "x-aura-mock-session": "aura-local-smoke-test" } } as never,
      res: {} as never,
    });
    expect(context.user).toBeNull();
  });
});

export {};

