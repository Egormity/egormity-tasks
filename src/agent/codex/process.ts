import {
  type InternalTasksAgentEnvironment,
  internalTasksAgentPolicy as policy,
} from "../config.js";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const nativeEnvironmentKeys = [
  "COREPACK_HOME",
  "DBUS_SESSION_BUS_ADDRESS",
  "XDG_RUNTIME_DIR",
  "SSH_AUTH_SOCK",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "CODEX_CA_CERTIFICATE",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

export const codexEnvironment = (config: InternalTasksAgentEnvironment, path: string) => ({
  PATH: path,
  HOME: homedir(),
  CODEX_HOME: config.codexHome,
  LANG: "C.UTF-8",
  TERM: "dumb",
  // Reuse native networking and keyring access, without inheriting application credentials.
  ...Object.fromEntries(
    nativeEnvironmentKeys.flatMap((key) => {
      const value = process.env[key];
      return value === undefined ? [] : [[key, value]];
    }),
  ),
  XDG_CACHE_HOME: join(config.codexHome, "cache"),
  UV_CACHE_DIR: join(config.codexHome, "cache/uv"),
  npm_config_cache: join(config.codexHome, "cache/npm"),
});

export const spawnCodex = (
  config: InternalTasksAgentEnvironment,
  path: string,
  args: string[],
  cwd?: string,
) =>
  spawn(config.codexBinary, args, {
    cwd,
    detached: true,
    env: codexEnvironment(config, path),
    stdio: ["pipe", "pipe", "pipe"],
  });

export const stopProcess = (child: ReturnType<typeof spawnCodex>) => {
  if (!child.pid || child.exitCode !== null) return;
  const signal = (value: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  signal("SIGTERM");
  const timer = setTimeout(() => signal("SIGKILL"), policy.stopGraceMilliseconds);
  timer.unref();
  child.once("close", () => clearTimeout(timer));
};
