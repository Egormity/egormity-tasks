import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoardTaskContext } from "../../api/contracts/task-context.js";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const prepareTaskContext = async (context: BoardTaskContext, worktrees: string) => {
  const { verdict, ...snapshot } = context;
  if (!verdict) return snapshot;
  const directory = join(worktrees, ".task-actions");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const id = createHash("sha256")
    .update(JSON.stringify([context.task.id, verdict.chatId, verdict.revision]))
    .digest("hex");
  const configFile = join(directory, `${id}.json`);
  await writeFile(configFile, JSON.stringify(verdict), { mode: 0o600 });
  // Only the helper invocation enters native history; the credential stays on Gateway.
  return {
    ...snapshot,
    saveVerdictCommand: `node ${quote(fileURLToPath(new URL("./submit-verdict.mjs", import.meta.url)))} ${quote(configFile)} < verdict.txt`,
  };
};
