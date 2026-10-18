import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveInternalTasksDevelopmentEnvironment } from "./src/api/config.js";
import { resolveInternalTasksAgentDevelopmentEnvironment } from "./src/agent/config.js";
import { internalTasksStatePolicy } from "./src/api/contracts/policy.js";

const root = import.meta.dirname;
try {
  process.loadEnvFile(join(root, ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const state = join(root, internalTasksStatePolicy.stateDirectory);
mkdirSync(state, { recursive: true, mode: 0o700 });
const tokenFile = join(state, internalTasksStatePolicy.tokenFile);
if (!process.env.OPERATIONS_AGENT_WORKER_TOKEN) {
  try {
    writeFileSync(tokenFile, randomBytes(48).toString("base64url"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}
const token =
  process.env.OPERATIONS_AGENT_WORKER_TOKEN ?? readFileSync(tokenFile, "utf8").trim();
const commands = [
  { args: ["vite"], env: process.env },
  {
    args: ["tsx", "watch", "src/api/main.ts"],
    env: resolveInternalTasksDevelopmentEnvironment(process.env, root, token),
  },
  {
    args: ["tsx", "watch", "src/agent/main.ts"],
    env: resolveInternalTasksAgentDevelopmentEnvironment(process.env, root, token),
  },
];
const children = commands.map(({ args, env }) =>
  spawn("npm", ["exec", "--", ...args], { cwd: root, env, stdio: "inherit", detached: true }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
