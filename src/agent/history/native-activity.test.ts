import { mkdtemp, mkdir, stat, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import type { Thread } from "../../api/contracts/agent.js";
import type { CodexRpc } from "../codex/rpc.js";
import {
  applyExternalActivity,
  readExternalTurns,
  reconcileExternalTurns,
  reconcileNativeThread,
} from "./native-activity.js";

it("prefers live loaded-thread state to stale history, preserving separate CLI activity", async () => {
  const call = vi.fn((method: string, params: Record<string, unknown>) => {
    if (method === "thread/loaded/list")
      return params.cursor
        ? { data: ["running"], nextCursor: null }
        : { data: ["idle"], nextCursor: "second-page" };
    if (method === "thread/read")
      return { thread: { status: { type: params.threadId === "idle" ? "idle" : "active" } } };
    if (method === "thread/turns/list")
      return { data: [{ id: "current", status: "inProgress" }] };
    throw Error(`Unexpected method ${method}`);
  });
  const rpc = { call } as unknown as CodexRpc;
  expect(
    await reconcileExternalTurns(rpc, [
      { threadId: "idle", turnId: "stale" },
      { threadId: "running", turnId: "old" },
      { threadId: "running", turnId: "current" },
      { threadId: "separate-cli", turnId: "external" },
    ]),
  ).toEqual([
    { threadId: "running", turnId: "current" },
    { threadId: "separate-cli", turnId: "external" },
  ]);
  expect(call).not.toHaveBeenCalledWith("thread/resume", expect.anything());
  expect(call).not.toHaveBeenCalledWith("thread/read", {
    threadId: "separate-cli",
    includeTurns: false,
  });
});

it("does not present unfinished persisted turns in a natively idle thread as working", () => {
  const thread = {
    status: { type: "idle" },
    turns: [
      { id: "stale", status: "inProgress" },
      { id: "done", status: "completed" },
    ],
  } as Thread;
  expect(reconcileNativeThread(thread).turns.map((turn) => turn.status)).toEqual([
    "interrupted",
    "completed",
  ]);
  expect(thread.turns[0]?.status).toBe("inProgress");
  const active = { ...thread, status: { type: "active", activeFlags: [] } } as Thread;
  expect(reconcileNativeThread(active)).toBe(active);
});

it("requires both persisted activity and a live writer lock, excluding our own thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "native-activity-"));
  const db = new DatabaseSync(join(root, "thread_history_1.sqlite"));
  const id = "11111111-1111-4111-8111-111111111111";
  const staleId = "22222222-2222-4222-8222-222222222222";
  const locks = join(root, "proc-locks");
  try {
    db.exec("CREATE TABLE thread_turns (thread_id TEXT, turn_id TEXT, status TEXT)");
    const insert = db.prepare("INSERT INTO thread_turns VALUES (?, ?, ?)");
    insert.run(id, "running-turn", "inProgress");
    insert.run(id, "old-interrupted-turn", "interrupted");
    insert.run(staleId, "crashed-turn", "inProgress");
    await mkdir(join(root, "thread-writer-locks"));
    const file = join(root, "thread-writer-locks", `${id}.lock`);
    await writeFile(file, "");
    await writeFile(join(root, "thread-writer-locks", `${staleId}.lock`), "");
    const value = await stat(file, { bigint: true });
    const major = ((value.dev >> 8n) & 0xfffn) | ((value.dev >> 32n) & ~0xfffn);
    const minor = (value.dev & 0xffn) | ((value.dev >> 12n) & ~0xffn);
    await writeFile(
      locks,
      `1: FLOCK  ADVISORY  WRITE 123 ${major.toString(16)}:${minor.toString(16)}:${value.ino} 0 EOF\n`,
    );
    expect(await readExternalTurns(root, null, locks)).toEqual([
      { threadId: id, turnId: "running-turn" },
    ]);
    expect(await readExternalTurns(root, id, locks)).toEqual([]);
    await writeFile(locks, "");
    expect(await readExternalTurns(root, null, locks)).toEqual([]);

    const thread = {
      id,
      status: { type: "notLoaded" },
      turns: [
        { id: "old-interrupted-turn", status: "interrupted" },
        { id: "running-turn", status: "interrupted" },
      ],
    } as Thread;
    const normalized = applyExternalActivity(thread, [
      { threadId: id, turnId: "running-turn" },
    ]);
    expect(normalized.status.type).toBe("active");
    expect(normalized.turns.map((turn) => turn.status)).toEqual(["interrupted", "inProgress"]);
    expect(thread.turns[1]?.status).toBe("interrupted");
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("does not invent external activity for a fresh profile or missing process visibility", async () => {
  const root = await mkdtemp(join(tmpdir(), "native-activity-empty-"));
  try {
    expect(await readExternalTurns(root, null, join(root, "missing-proc"))).toEqual([]);
    const locks = join(root, "proc-locks");
    await writeFile(locks, "");
    expect(await readExternalTurns(root, null, locks)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
