import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { z } from "zod";
import type { SshAccess } from "../../api/contracts/agent.js";

const targetSchema = z.object({
  host: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/u),
  user: z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/u),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  directory: z.string().startsWith("/"),
  identityFile: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
});
export type SshTarget = z.infer<typeof targetSchema> & { id: "main" | "gateway" };

export const parseSshTargets = (environment: NodeJS.ProcessEnv): SshTarget[] =>
  (["main", "gateway"] as const).flatMap((id) => {
    const prefix = `OPERATIONS_AGENT_SSH_${id.toUpperCase()}_`;
    const value = (key: string) => environment[prefix + key] || undefined;
    if (!["HOST", "USER", "PASSWORD", "IDENTITY_FILE"].some((key) => value(key))) return [];
    return [
      {
        id,
        ...targetSchema.parse({
          host: value("HOST"),
          user: value("USER"),
          port: value("PORT"),
          directory: value("DIRECTORY"),
          identityFile: value("IDENTITY_FILE"),
          password: value("PASSWORD"),
        }),
      },
    ];
  });

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** SSH reads passwords through askpass; only commands and paths are sent to Codex. */
export const prepareSshAccess = async (config: {
  sshTargets: SshTarget[];
  sshKnownHosts: string;
  worktrees: string;
}): Promise<SshAccess[]> => {
  const privateDirectory = join(dirname(config.worktrees), "ssh");
  const result: SshAccess[] = [];
  for (const target of config.sshTargets) {
    const args = [
      "ssh",
      "-p",
      String(target.port),
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile="${config.sshKnownHosts.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
      "-o",
      "ConnectTimeout=15",
      "-o",
      "ForwardAgent=no",
    ];
    let prefix = "";
    const authentication = target.identityFile ? "key" : target.password ? "password" : "agent";
    if (target.identityFile)
      args.push(
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-i",
        resolve(target.identityFile),
      );
    else if (target.password) {
      await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
      await chmod(privateDirectory, 0o700);
      const passwordFile = join(privateDirectory, `${target.id}.password`);
      const askpass = join(privateDirectory, `${target.id}.askpass`);
      await writeFile(passwordFile, target.password, { mode: 0o600 });
      await chmod(passwordFile, 0o600);
      await writeFile(askpass, `#!/bin/sh\nexec /bin/cat ${quote(passwordFile)}\n`, {
        mode: 0o700,
      });
      await chmod(askpass, 0o700);
      prefix = `SSH_ASKPASS_REQUIRE=force SSH_ASKPASS=${quote(askpass)} DISPLAY=amazi-agent `;
      args.push(
        "-o",
        "BatchMode=no",
        "-o",
        "NumberOfPasswordPrompts=1",
        "-o",
        "PubkeyAuthentication=no",
      );
    } else args.push("-o", "BatchMode=yes");
    args.push(`${target.user}@${target.host}`);
    result.push({
      id: target.id,
      host: target.host,
      user: target.user,
      port: target.port,
      directory: target.directory,
      authentication,
      command: prefix + args.map(quote).join(" "),
    });
  }
  return result;
};

export const defaultKnownHosts = () => join(homedir(), ".ssh", "known_hosts");
