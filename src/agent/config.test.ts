import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  parseInternalTasksAgentEnvironment,
  resolveInternalTasksAgentDevelopmentEnvironment,
} from "./config.js";
import { codexEnvironment } from "./codex/process.js";

const token = "x".repeat(32);
afterEach(() => vi.unstubAllEnvs());

it("uses the existing CLI profile locally without seeding global instructions", () => {
  const development = resolveInternalTasksAgentDevelopmentEnvironment({}, "/app", token);
  const config = parseInternalTasksAgentEnvironment(development);
  expect(config.codexHome).toBe(join(homedir(), ".codex"));
  expect(codexEnvironment(config, "/bin").CODEX_HOME).toBe(config.codexHome);
  expect(development.OPERATIONS_AGENT_INSTRUCTIONS_TEMPLATE).toBeUndefined();
  expect(config.worktrees).toBe("/app/.runtime/operations-agent/worktrees");
  expect(config.instructionsFile).toBe("/app/src/agent/instructions/agent.md");
});

it("configures one instruction file without changing the native profile", () => {
  const config = parseInternalTasksAgentEnvironment(
    resolveInternalTasksAgentDevelopmentEnvironment(
      {
        CODEX_HOME: "/native/codex",
        OPERATIONS_AGENT_INSTRUCTIONS_FILE: "/rules/agent.md",
      },
      "/app",
      token,
    ),
  );
  expect(config.instructionsFile).toBe("/rules/agent.md");
  expect(config.codexHome).toBe("/native/codex");
});

it("honors CODEX_HOME and gives an explicitly isolated agent profile precedence", () => {
  const native = resolveInternalTasksAgentDevelopmentEnvironment(
    { CODEX_HOME: "/native/codex" },
    "/app",
    token,
  );
  expect(parseInternalTasksAgentEnvironment(native).codexHome).toBe("/native/codex");
  const isolated = resolveInternalTasksAgentDevelopmentEnvironment(
    { ...native, OPERATIONS_AGENT_CODEX_HOME: "/isolated/codex" },
    "/app",
    token,
  );
  expect(parseInternalTasksAgentEnvironment(isolated).codexHome).toBe("/isolated/codex");
  const server = parseInternalTasksAgentEnvironment({
    CODEX_HOME: "/workstation/codex",
    OPERATIONS_AGENT_CODEX_HOME: "/home/node/.codex",
    OPERATIONS_AGENT_WORKER_TOKEN: token,
  });
  expect(codexEnvironment(server, "/bin").CODEX_HOME).toBe("/home/node/.codex");
});

it("preserves networking and keyring access without passing bridge credentials into Codex", () => {
  vi.stubEnv("DBUS_SESSION_BUS_ADDRESS", "unix:path=/run/user/1000/bus");
  vi.stubEnv("XDG_RUNTIME_DIR", "/run/user/1000");
  vi.stubEnv("OPERATIONS_AGENT_WORKER_TOKEN", token);
  vi.stubEnv("OPERATIONS_AGENT_SSH_MAIN_PASSWORD", "ssh-secret-for-test");
  vi.stubEnv("SSH_AUTH_SOCK", "/run/user/1000/ssh-agent");
  vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:7897");
  vi.stubEnv("no_proxy", "localhost,127.0.0.1");
  vi.stubEnv("CODEX_CA_CERTIFICATE", "/certs/company.pem");
  const config = parseInternalTasksAgentEnvironment({ OPERATIONS_AGENT_WORKER_TOKEN: token });
  const environment = codexEnvironment(config, "/bin");
  expect(environment).toMatchObject({
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
    XDG_RUNTIME_DIR: "/run/user/1000",
    HTTPS_PROXY: "http://127.0.0.1:7897",
    no_proxy: "localhost,127.0.0.1",
    CODEX_CA_CERTIFICATE: "/certs/company.pem",
    SSH_AUTH_SOCK: "/run/user/1000/ssh-agent",
  });
  expect(environment).not.toHaveProperty("OPERATIONS_AGENT_WORKER_TOKEN");
  expect(environment).not.toHaveProperty("OPERATIONS_AGENT_SSH_MAIN_PASSWORD");
});
