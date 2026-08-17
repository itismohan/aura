import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_MOCK_SESSION_HEADER = "x-aura-mock-session";
const DEV_MOCK_SESSION_VALUE = "aura-local-smoke-test";

function getDevelopmentMockUser(): User {
  const now = new Date();
  return {
    id: 1,
    openId: "aura-local-smoke-user",
    name: "AURA Local Smoke User",
    email: "aura-local@example.test",
    loginMethod: "development-mock",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const mockHeader = opts.req.headers[DEV_MOCK_SESSION_HEADER];
  if (process.env.NODE_ENV === "development" && mockHeader === DEV_MOCK_SESSION_VALUE) {
    return { req: opts.req, res: opts.res, user: getDevelopmentMockUser() };
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
