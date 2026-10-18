import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";
import { parseSshTargets, prepareSshAccess } from "./ssh.js";
import { parseInternalTasksAgentEnvironment } from "../config.js";
import { readAgentInstructions } from "../instructions/instructions.js";

const execute = promisify(execFile);
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "agent's ssh "));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it("disables empty targets and rejects partial settings and invalid ports", () => {
  expect(
    parseSshTargets({
      OPERATIONS_AGENT_SSH_MAIN_HOST: "",
      OPERATIONS_AGENT_SSH_MAIN_PORT: "22",
    }),
  ).toEqual([]);
  expect(() => parseSshTargets({ OPERATIONS_AGENT_SSH_MAIN_HOST: "main.test" })).toThrow();
  expect(() =>
    parseSshTargets({
      OPERATIONS_AGENT_SSH_MAIN_HOST: "main.test",
      OPERATIONS_AGENT_SSH_MAIN_USER: "admin",
      OPERATIONS_AGENT_SSH_MAIN_DIRECTORY: "/srv/app",
      OPERATIONS_AGENT_SSH_MAIN_PORT: "65536",
    }),
  ).toThrow();
});

it("produces a valid OpenSSH command with protected host keys and isolated password delivery", async () => {
  const password = "fixture '$secret with spaces";
  const [target] = await prepareSshAccess({
    sshTargets: [
      {
        id: "main",
        host: "main.test",
        user: "admin",
        port: 2222,
        directory: "/srv/app",
        password,
      },
    ],
    sshKnownHosts: join(root, "known hosts"),
    worktrees: join(root, "worktrees"),
  });
  expect(JSON.stringify(target)).not.toContain(password);
  if (!target) throw new Error("Missing SSH target");
  const { stdout } = await execute("/bin/sh", [
    "-c",
    target.command.replace("'ssh'", "'ssh' '-G'"),
  ]);
  expect(stdout).toContain("hostname main.test\n");
  expect(stdout).toContain("user admin\n");
  expect(stdout).toContain("port 2222\n");
  expect(stdout).toContain("stricthostkeychecking true\n");
  expect(stdout).toContain("pubkeyauthentication false\n");
  const helper = join(root, "ssh/main.askpass");
  const delivered = await execute(helper);
  expect(delivered.stdout).toBe(password);
  expect((await stat(join(root, "ssh/main.password"))).mode & 0o777).toBe(0o600);
  expect((await stat(helper)).mode & 0o777).toBe(0o700);
  expect((await stat(join(root, "ssh"))).mode & 0o777).toBe(0o700);
});

it("uses a configured key without creating password files", async () => {
  await writeFile(join(root, "private key"), "SSH config fixture", { mode: 0o600 });
  const [target] = await prepareSshAccess({
    sshTargets: [
      {
        id: "gateway",
        host: "gateway.test",
        user: "ops",
        port: 22,
        directory: "/srv/gateway",
        identityFile: join(root, "private key"),
      },
    ],
    sshKnownHosts: join(root, "known_hosts"),
    worktrees: join(root, "worktrees"),
  });
  if (!target) throw new Error("Missing SSH target");
  const { stdout } = await execute("/bin/sh", [
    "-c",
    target.command.replace("'ssh'", "'ssh' '-G'"),
  ]);
  expect(target.authentication).toBe("key");
  expect(stdout).toContain("batchmode yes\n");
  expect(stdout).toContain("identitiesonly yes\n");
  expect(stdout).toContain(`identityfile ${join(root, "private key")}\n`);
  await expect(stat(join(root, "ssh"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("refreshes application instructions and exposes connection details without credentials", async () => {
  const path = join(root, "instructions.md");
  await writeFile(path, "First instructions.");
  const config = parseInternalTasksAgentEnvironment({
    OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
    OPERATIONS_AGENT_WORKTREES: join(root, "worktrees"),
    OPERATIONS_AGENT_INSTRUCTIONS_FILE: path,
    OPERATIONS_AGENT_SSH_MAIN_HOST: "main.test",
    OPERATIONS_AGENT_SSH_MAIN_USER: "admin",
    OPERATIONS_AGENT_SSH_MAIN_DIRECTORY: "/srv/app",
    OPERATIONS_AGENT_SSH_MAIN_PASSWORD: "secret-for-test",
  });
  const instructions = await readAgentInstructions(config);
  expect(instructions.instruction).toEqual({ path, text: "First instructions." });
  expect(instructions.developerInstructions).toContain("admin@main.test:22");
  expect(JSON.stringify(instructions)).not.toContain("secret-for-test");
  await writeFile(path, "Updated instructions.");
  expect((await readAgentInstructions(config)).developerInstructions).toContain(
    "Updated instructions.",
  );
  expect(await readFile(path, "utf8")).toBe("Updated instructions.");
  await writeFile(path, "");
  await expect(readAgentInstructions(config)).rejects.toThrow("non-empty");
});
