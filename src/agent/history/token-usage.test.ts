import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readTokenUsage } from "./token-usage.js";

it("reads the last native context counters, ignores other events and a partially written line", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-usage-"));
  const path = join(root, "rollout.jsonl");
  const event = (tokens: number) =>
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { total_tokens: tokens },
          total_token_usage: { total_tokens: 99000 },
          model_context_window: 128000,
        },
      },
    });
  try {
    expect(await readTokenUsage(path)).toBeNull();
    await writeFile(
      path,
      [
        event(100),
        event(2300),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", info: null } }),
        '{"type":',
      ].join("\n"),
    );
    expect(await readTokenUsage(path)).toEqual({
      tokens: 2300,
      totalTokens: 99000,
      window: 128000,
    });
    // Counter absent in the bounded tail: do not read an unbounded history or invent zero.
    await writeFile(path, event(100) + "\n" + "x".repeat(9 * 1024 * 1024));
    expect(await readTokenUsage(path)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
