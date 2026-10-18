import { z } from "zod";
import { parseTelegramConfiguration } from "./auth/telegram.js";

import {
  internalTasksPolicy,
  internalTasksDevelopmentPolicy,
  internalTasksStatePolicy,
} from "./contracts/policy.js";

export { internalTasksPolicy } from "./contracts/policy.js";

const environmentSchema = z.object({
  OPERATIONS_AGENT_PUBLIC_URL: z.url().default("http://localhost:3010/"),
  OPERATIONS_AGENT_API_URL: z.url().default("http://localhost:3000"),
  OPERATIONS_AGENT_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(internalTasksPolicy.port),
  OPERATIONS_AGENT_WORKER_URL: z.url().default("http://localhost:3011"),
  OPERATIONS_AGENT_WORKER_TOKEN: z.string().min(32),
  OPERATIONS_AGENT_DATA_DIRECTORY: z.string().default("/data"),
});

export const parseInternalTasksEnvironment = (environment: NodeJS.ProcessEnv) => {
  const parsed = environmentSchema.parse(environment);
  return {
    publicUrl: parsed.OPERATIONS_AGENT_PUBLIC_URL,
    apiUrl: parsed.OPERATIONS_AGENT_API_URL.replace(/\/$/u, ""),
    port: parsed.OPERATIONS_AGENT_PORT,
    workerUrl: parsed.OPERATIONS_AGENT_WORKER_URL.replace(/\/$/u, ""),
    workerToken: parsed.OPERATIONS_AGENT_WORKER_TOKEN,
    dataDirectory: parsed.OPERATIONS_AGENT_DATA_DIRECTORY,
    telegram: parseTelegramConfiguration(environment),
  };
};

export type InternalTasksEnvironment = ReturnType<typeof parseInternalTasksEnvironment>;

export const resolveInternalTasksDevelopmentEnvironment = (
  environment: NodeJS.ProcessEnv,
  repository: string,
  workerToken: string,
): NodeJS.ProcessEnv => ({
  OPERATIONS_AGENT_PUBLIC_URL: `http://${internalTasksDevelopmentPolicy.frontendHost}:${internalTasksDevelopmentPolicy.frontendPort}/`,
  OPERATIONS_AGENT_DATA_DIRECTORY: `${repository}/${internalTasksStatePolicy.stateDirectory}/data`,
  OPERATIONS_AGENT_WORKER_URL: `http://127.0.0.1:${environment.OPERATIONS_AGENT_WORKER_PORT ?? 3011}`,
  OPERATIONS_AGENT_WORKER_TOKEN: workerToken,
  ...environment,
});
