import { z } from "zod";
import { parseTelegramConfiguration } from "./auth/telegram.js";

import { internalTasksPolicy } from "./contracts/policy.js";

export { internalTasksPolicy } from "./contracts/policy.js";

const environmentSchema = z
  .object({
    OPERATIONS_AGENT_PUBLIC_URL: z.url().default("http://localhost:3010/"),
    OPERATIONS_AGENT_LOCAL_ADMIN_EMAIL: z
      .string()
      .trim()
      .regex(/^[^\s@]+@[^\s@]+$/u)
      .transform((value) => value.toLowerCase()),
    OPERATIONS_AGENT_LOCAL_ADMIN_NAME: z.string().trim().min(1).max(120),
    OPERATIONS_AGENT_LOCAL_ADMIN_PASSWORD_HASH: z.string().refine((value) => {
      const [salt, hash, extra] = value.split(".");
      if (!salt || !hash || extra !== undefined) return false;
      return (
        Buffer.from(salt, "base64url").length >= 16 &&
        Buffer.from(hash, "base64url").length === 64
      );
    }),
    OPERATIONS_AGENT_LOCAL_SESSION_SECRET: z.string().min(32),
    OPERATIONS_AGENT_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(internalTasksPolicy.port),
    OPERATIONS_AGENT_WORKER_URL: z.url().optional(),
    OPERATIONS_AGENT_WORKER_TOKEN: z.string().min(32).optional(),
    OPERATIONS_AGENT_DATA_DIRECTORY: z.string().default(".runtime/data"),
  })
  .superRefine((value, context) => {
    if (
      Boolean(value.OPERATIONS_AGENT_WORKER_URL) !==
      Boolean(value.OPERATIONS_AGENT_WORKER_TOKEN)
    )
      context.addIssue({
        code: "custom",
        message: "Configure both Gateway worker settings or neither.",
      });
  });

export const parseInternalTasksEnvironment = (environment: NodeJS.ProcessEnv) => {
  const parsed = environmentSchema.parse({
    ...environment,
    OPERATIONS_AGENT_PORT:
      environment.PORT ?? environment.OPERATIONS_AGENT_PORT ?? internalTasksPolicy.port,
    OPERATIONS_AGENT_DATA_DIRECTORY:
      environment.OPERATIONS_AGENT_DATA_DIRECTORY ??
      (environment.NODE_ENV === "production" ? "/data" : ".runtime/data"),
  });
  return {
    publicUrl: parsed.OPERATIONS_AGENT_PUBLIC_URL,
    port: parsed.OPERATIONS_AGENT_PORT,
    workerConfigured: Boolean(parsed.OPERATIONS_AGENT_WORKER_URL),
    workerUrl: parsed.OPERATIONS_AGENT_WORKER_URL?.replace(/\/$/u, "") ?? "",
    workerToken: parsed.OPERATIONS_AGENT_WORKER_TOKEN ?? "",
    dataDirectory: parsed.OPERATIONS_AGENT_DATA_DIRECTORY,
    adminEmail: parsed.OPERATIONS_AGENT_LOCAL_ADMIN_EMAIL,
    adminName: parsed.OPERATIONS_AGENT_LOCAL_ADMIN_NAME,
    adminPasswordHash: parsed.OPERATIONS_AGENT_LOCAL_ADMIN_PASSWORD_HASH,
    sessionSecret: parsed.OPERATIONS_AGENT_LOCAL_SESSION_SECRET,
    telegram: parseTelegramConfiguration(environment),
  };
};

export type InternalTasksEnvironment = ReturnType<typeof parseInternalTasksEnvironment>;
