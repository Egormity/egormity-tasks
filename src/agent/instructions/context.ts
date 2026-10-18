import type { AgentContext, Thread } from "../../api/contracts/agent.js";
import type { InternalTasksAgentEnvironment } from "../config.js";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { readAgentInstructions } from "./instructions.js";
const execute = promisify(execFile);

export const readContext = async (
  config: InternalTasksAgentEnvironment,
  thread?: Thread,
  nativeSources?: string[],
): Promise<AgentContext> => {
  const configured = await readAgentInstructions(config);
  const cwd = thread?.cwd ?? config.repository;
  const paths = [
    join(config.codexHome, "AGENTS.override.md"),
    join(config.codexHome, "AGENTS.md"),
  ];
  const ancestors: string[] = [];
  const root = await execute("git", ["-C", cwd, "rev-parse", "--show-toplevel"])
    .then((result) => result.stdout.trim())
    .catch(() => resolve(cwd));
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    ancestors.unshift(directory);
    if (directory === root || dirname(directory) === directory) break;
  }
  for (const directory of ancestors)
    paths.push(join(directory, "AGENTS.override.md"), join(directory, "AGENTS.md"));
  const instructions: AgentContext["instructions"] = [];
  const usedDirectories = new Set<string>();
  for (const path of nativeSources ?? paths) {
    if (usedDirectories.has(dirname(path))) continue;
    try {
      instructions.push({ path, text: (await readFile(path, "utf8")).slice(0, 64_000) });
      usedDirectories.add(dirname(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const branch = await execute("git", ["-C", cwd, "branch", "--show-current"])
    .then((result) => result.stdout.trim())
    .catch(() => null);
  return {
    repository: config.repository,
    cwd,
    branch,
    threadId: thread?.id ?? null,
    codexHome: config.codexHome,
    model: thread?.model ?? config.model ?? null,
    sandbox: config.sandbox,
    instructions: [configured.instruction, ...instructions],
    sshTargets: configured.sshTargets,
  };
};
