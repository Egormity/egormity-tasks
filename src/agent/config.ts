import { z } from "zod";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { defaultKnownHosts, parseSshTargets } from "./workspace/ssh.js";

import {
  internalTasksProtocolPolicy,
  internalTasksStatePolicy,
} from "../api/contracts/policy.js";

export const internalTasksAgentPolicy = {
  ...internalTasksProtocolPolicy,
  requestTimeoutMilliseconds: 15_000,
  statusCacheMilliseconds: 15_000,
  streamHeartbeatMilliseconds: 15_000,
  stopGraceMilliseconds: 5_000,
  maxOutputLineBytes: 2_000_000,
  loginTimeoutMilliseconds: 15 * 60 * 1_000,
  workerPort: 3011,
} as const;

const environmentSchema = z.object({
  OPERATIONS_AGENT_WORKER_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(internalTasksAgentPolicy.workerPort),
  OPERATIONS_AGENT_WORKER_TOKEN: z.string().min(32),
  OPERATIONS_AGENT_REPOSITORY: z.string().default("/workspace/repository"),
  OPERATIONS_AGENT_WORKTREES: z.string().default("/workspace/chats"),
  OPERATIONS_AGENT_CODEX_HOME: z.string().min(1).optional(),
  OPERATIONS_AGENT_CODEX_BINARY: z.string().default("codex"),
  OPERATIONS_AGENT_INSTRUCTIONS_FILE: z
    .string()
    .min(1)
    .default("src/agent/instructions/agent.md"),
  OPERATIONS_AGENT_SSH_KNOWN_HOSTS: z.string().min(1).optional(),
  OPERATIONS_AGENT_MODEL: z.string().optional(),
  OPERATIONS_AGENT_SANDBOX: z
    .enum(["workspace-write", "danger-full-access"])
    .default("workspace-write"),
});

/** Use the same native account/settings/history as the CLI unless explicitly isolated. */
export const resolveCodexHome = (environment: NodeJS.ProcessEnv) =>
  resolve(
    environment.OPERATIONS_AGENT_CODEX_HOME ??
      environment.CODEX_HOME ??
      join(homedir(), ".codex"),
  );

export const parseInternalTasksAgentEnvironment = (environment: NodeJS.ProcessEnv) => {
  const parsed = environmentSchema.parse(environment);
  return {
    workerPort: parsed.OPERATIONS_AGENT_WORKER_PORT,
    workerToken: parsed.OPERATIONS_AGENT_WORKER_TOKEN,
    repository: parsed.OPERATIONS_AGENT_REPOSITORY,
    worktrees: parsed.OPERATIONS_AGENT_WORKTREES,
    codexHome: resolveCodexHome(environment),
    codexBinary: parsed.OPERATIONS_AGENT_CODEX_BINARY,
    instructionsFile: resolve(parsed.OPERATIONS_AGENT_INSTRUCTIONS_FILE),
    sshTargets: parseSshTargets(environment),
    sshKnownHosts: resolve(parsed.OPERATIONS_AGENT_SSH_KNOWN_HOSTS ?? defaultKnownHosts()),
    model: parsed.OPERATIONS_AGENT_MODEL,
    sandbox: parsed.OPERATIONS_AGENT_SANDBOX,
  };
};

export type InternalTasksAgentEnvironment = ReturnType<
  typeof parseInternalTasksAgentEnvironment
>;

export const resolveInternalTasksAgentDevelopmentEnvironment = (
  environment: NodeJS.ProcessEnv,
  repository: string,
  workerToken: string,
): NodeJS.ProcessEnv => ({
  OPERATIONS_AGENT_CODEX_HOME: resolveCodexHome(environment),
  OPERATIONS_AGENT_INSTRUCTIONS_FILE: join(repository, "src/agent/instructions/agent.md"),
  OPERATIONS_AGENT_WORKTREES: `${repository}/${internalTasksStatePolicy.stateDirectory}/worktrees`,
  OPERATIONS_AGENT_WORKER_TOKEN: workerToken,
  ...environment,
});
