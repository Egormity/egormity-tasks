import { open } from "node:fs/promises";
import { z } from "zod";
import type { SessionStatus } from "../../api/contracts/session-status.js";

const usage = z.object({
  last_token_usage: z.object({ total_tokens: z.number().nonnegative() }),
  total_token_usage: z.object({ total_tokens: z.number().nonnegative() }),
  model_context_window: z.number().positive().nullable().optional(),
});

/** Read only the bounded tail of the native rollout returned by Codex, never a client path.
 * No application history store: context use survives bridge restarts and external CLI work.
 */
export const readTokenUsage = async (
  path: string | null,
): Promise<SessionStatus["context"]> => {
  if (!path) return null;
  const file = await open(path, "r").catch(() => null);
  if (!file) return null;
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - 8 * 1024 * 1024);
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    if (start) lines.shift();
    for (let index = lines.length - 1; index >= 0; index--) {
      try {
        const event = JSON.parse(lines[index]!) as {
          type?: string;
          payload?: { type?: string; info?: unknown };
        };
        if (event.type !== "event_msg" || event.payload?.type !== "token_count") continue;
        const parsed = usage.safeParse(event.payload.info);
        if (parsed.success)
          return {
            tokens: parsed.data.last_token_usage.total_tokens,
            window: parsed.data.model_context_window ?? null,
            totalTokens: parsed.data.total_token_usage.total_tokens,
          };
      } catch {
        // A live writer may not have completed the final JSON line yet.
      }
    }
    return null;
  } finally {
    await file.close();
  }
};
