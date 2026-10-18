import { scryptSync } from "node:crypto";
import { createSessionToken, localAdminUser } from "./auth.js";
import type { InternalTasksEnvironment } from "../config.js";

export const testAdminPassword = "test-only-local-password-79f31b";
const testSalt = Buffer.from("test-salt-for-local-admin");
const testHash = scryptSync(testAdminPassword, testSalt, 64).toString("base64url");

export const localAuthTestEnvironment = {
  OPERATIONS_AGENT_LOCAL_ADMIN_EMAIL: "admin@example",
  OPERATIONS_AGENT_LOCAL_ADMIN_NAME: "Admin",
  OPERATIONS_AGENT_LOCAL_ADMIN_PASSWORD_HASH: `${testSalt.toString("base64url")}.${testHash}`,
  OPERATIONS_AGENT_LOCAL_SESSION_SECRET: "local-test-session-secret-not-for-production-8f6bdc",
};

export const localAdminCookieToken = (config: InternalTasksEnvironment) =>
  createSessionToken(
    localAdminUser(config),
    config.sessionSecret,
    Date.now() + 7 * 24 * 60 * 60 * 1_000,
  );
