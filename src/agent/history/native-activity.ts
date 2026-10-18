import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ExternalTurn, Thread } from "../../api/contracts/agent.js";
import type { CodexRpc } from "../codex/rpc.js";

const rowSchema = z.object({ thread_id: z.uuid(), turn_id: z.string() });

export const readLoadedThreadIds = async (rpc: CodexRpc): Promise<Set<string>> => {
  const ids = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { data: string[]; nextCursor: string | null } = await rpc.call(
      "thread/loaded/list",
      { limit: 100, cursor },
    );
    for (const id of page.data) ids.add(id);
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
};

/** A loaded thread keeps its writer lock while idle; live native state wins over disk. */
export const reconcileExternalTurns = async (rpc: CodexRpc, candidates: ExternalTurn[]) => {
  if (!candidates.length) return [];
  const loaded = await readLoadedThreadIds(rpc);
  const resolved = await Promise.all(
    candidates.map(async (candidate) => {
      if (!loaded.has(candidate.threadId)) return candidate;
      const { thread } = await rpc.call<{ thread: Thread }>("thread/read", {
        threadId: candidate.threadId,
        includeTurns: false,
      });
      if (thread.status.type !== "active") return null;
      const { data } = await rpc.call<{ data: Thread["turns"] }>("thread/turns/list", {
        threadId: candidate.threadId,
        limit: 1,
        sortDirection: "desc",
        itemsView: "summary",
      });
      return data[0]?.status === "inProgress" && data[0].id === candidate.turnId
        ? candidate
        : null;
    }),
  );
  return resolved.filter((turn) => turn !== null);
};

/** Linux dev_t, as recorded by /proc/locks (major:minor:inode). */
const lockKey = (device: string) => {
  const [majorHex, minorHex, inode] = device.split(":");
  if (!majorHex || !minorHex || !inode) return "";
  const major = BigInt(`0x${majorHex}`);
  const minor = BigInt(`0x${minorHex}`);
  const dev =
    (minor & 0xffn) |
    ((major & 0xfffn) << 8n) |
    ((minor & ~0xffn) << 12n) |
    ((major & ~0xfffn) << 32n);
  return `${dev}:${inode}`;
};

/** Codex 0.162.1 persisted turn state + a live native writer lock, never a timestamp guess. */
export const readExternalTurns = async (
  codexHome: string,
  ownThreadId: string | null,
  locksPath = "/proc/locks",
): Promise<ExternalTurn[]> => {
  let db: DatabaseSync | undefined;
  try {
    const locks = new Set(
      (await readFile(locksPath, "utf8")).split("\n").flatMap((line) => {
        const match = /^\d+: FLOCK\s+ADVISORY\s+WRITE\s+\d+\s+([a-f\d]+:[a-f\d]+:\d+) /iu.exec(
          line,
        );
        return match ? [lockKey(match[1]!)] : [];
      }),
    );
    db = new DatabaseSync(join(codexHome, "thread_history_1.sqlite"), { readOnly: true });
    const rows = db
      .prepare("SELECT thread_id, turn_id FROM thread_turns WHERE status = 'inProgress'")
      .all();
    const active = await Promise.all(
      rows.map(async (value) => {
        const row = rowSchema.safeParse(value);
        if (!row.success || row.data.thread_id === ownThreadId) return null;
        try {
          const file = await stat(
            join(codexHome, "thread-writer-locks", `${row.data.thread_id}.lock`),
            { bigint: true },
          );
          return locks.has(`${file.dev}:${file.ino}`)
            ? { threadId: row.data.thread_id, turnId: row.data.turn_id }
            : null;
        } catch {
          return null;
        }
      }),
    );
    return active.filter((value) => value !== null);
  } catch {
    // Fresh profiles and platforms without Linux writer-lock visibility have no evidence
    // of external execution. Do not infer activity from stale inProgress rows alone.
    return [];
  } finally {
    db?.close();
  }
};

export const reconcileNativeThread = (thread: Thread): Thread => {
  if (
    thread.status.type !== "idle" ||
    !thread.turns.some((turn) => turn.status === "inProgress")
  )
    return thread;
  return {
    ...thread,
    turns: thread.turns.map((turn) =>
      turn.status === "inProgress" ? { ...turn, status: "interrupted" } : turn,
    ),
  };
};

export const applyExternalActivity = (thread: Thread, active: ExternalTurn[]): Thread => {
  const turns = active.filter((turn) => turn.threadId === thread.id);
  if (!turns.length) return thread;
  return {
    ...thread,
    status: { type: "active", activeFlags: [] },
    turns: thread.turns.map((turn) =>
      turns.some((value) => value.turnId === turn.id)
        ? { ...turn, status: "inProgress", error: null }
        : turn,
    ),
  };
};
