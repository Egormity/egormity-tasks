import type { InternalTasksAgentEnvironment } from "../config.js";
import { execFile } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export const prepareWorkspace = async (
  config: InternalTasksAgentEnvironment,
  chatId: string,
) => {
  const root = await realpath(config.repository);
  await mkdir(config.worktrees, { recursive: true });
  const directory = join(config.worktrees, chatId);
  try {
    await realpath(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const branch = `fix/codex/operations-${chatId}/${new Date().toISOString().slice(0, 10)}`;
    await execute("git", ["-C", root, "worktree", "add", "-b", branch, directory, "HEAD"]);
  }
  return directory;
};
