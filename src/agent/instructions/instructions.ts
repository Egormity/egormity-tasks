import { readFile } from "node:fs/promises";
import type { InternalTasksAgentEnvironment } from "../config.js";
import { prepareSshAccess } from "../workspace/ssh.js";

export const readAgentInstructions = async (config: InternalTasksAgentEnvironment) => {
  const path = config.instructionsFile;
  const text = await readFile(path, "utf8");
  if (!text.trim() || Buffer.byteLength(text) > 64_000)
    throw new Error(`Agent instructions must be non-empty and at most 64 KB: ${path}`);
  const sshTargets = await prepareSshAccess(config);
  const access = sshTargets
    .map(
      (target) =>
        `- ${target.id}: ${target.user}@${target.host}:${target.port}; repository: ${target.directory}\n` +
        `  SSH command prefix: ${target.command}`,
    )
    .join("\n");
  return {
    instruction: { path, text },
    sshTargets,
    developerInstructions:
      `${text}\n\nConfigured SSH access:\n${access || "No remote SSH targets configured."}\n` +
      "Append the requested remote command to the SSH prefix. Keep host-key checking enabled. " +
      "Never print passwords, read password files, or run the askpass helper directly. " +
      "A configured connection does not authorize production changes; follow the user's task scope.",
  };
};
