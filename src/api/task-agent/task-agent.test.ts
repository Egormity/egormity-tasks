import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApplication } from "../app.js";
import { parseInternalTasksEnvironment } from "../config.js";
import { BoardDatabase } from "../board/database.js";
import type { LiveBoardSnapshot, Task } from "../contracts/board.js";
import type { Snapshot } from "../contracts/agent.js";
import type { TaskChatLink } from "../contracts/task-agent.js";
import { verdictToken } from "./task-verdict.js";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareTaskContext } from "../../agent/tasks/task-context.js";

let servers: Server[];
let db: BoardDatabase;
let application: ReturnType<typeof createApplication>;
let config: ReturnType<typeof parseInternalTasksEnvironment>;
let base: string;
let nativeChats: ReturnType<typeof nativeChat>[];
let calls: string[];
let workerUnavailable: boolean;
const nativeChat = (started = true) => ({
  id: randomUUID(),
  name: "CLI conversation",
  turns: started ? [{ id: randomUUID(), items: [{ type: "userMessage" }] }] : [],
});
const origin = "https://tasks.example.test";
const headers = {
  Cookie: "amazi_operations_session=test-session",
  Origin: origin,
  "Content-Type": "application/json",
};
const listen = async (app: express.Express) => {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Address");
  return `http://127.0.0.1:${address.port}`;
};
const call = (path: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    headers,
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const read = async <T>(path: string, body?: unknown): Promise<T> => {
  const response = await call(path, body);
  expect(response.ok, await response.clone().text()).toBe(true);
  return (await response.json()) as T;
};
const task = (title = "Investigate latency") =>
  read<Task>("/board/cards", {
    title,
    description: "Discuss before implementing",
    priority: "medium",
    status: "backlog",
    tagIds: [],
  });
const link = (taskId: string, chatId: string) =>
  read<TaskChatLink>(`/board/cards/${taskId}/chats`, { chatId });

beforeEach(async () => {
  servers = [];
  calls = [];
  workerUnavailable = false;
  nativeChats = [nativeChat(), nativeChat(), nativeChat(false)];
  const auth = express();
  auth.get("/auth/session", (_req, res) =>
    res.json({
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Admin",
        email: null,
        role: "admin",
      },
    }),
  );
  const worker = express();
  worker.use(express.json());
  worker.use((req, res, next) => {
    expect(req.headers.authorization).toBe(`Bearer ${"x".repeat(32)}`);
    calls.push(`${req.method} ${req.path}`);
    if (workerUnavailable) {
      res.status(503).json({ error: "Unavailable" });
      return;
    }
    next();
  });
  worker.get("/chats/:id", (req, res) => {
    const chat = nativeChats.find((item) => item.id === req.params.id);
    if (chat) res.json(chat);
    else res.status(404).json({ error: "Conversation not found." });
  });
  worker.get("/snapshot", (req, res) =>
    res.json({
      chats: nativeChats,
      detail: nativeChats.find((chat) => chat.id === req.query.chatId) ?? null,
      cursor: 0,
      requests: [],
      status: { authenticated: true, busy: false, activeChatId: null, externalTurns: [] },
    }),
  );
  worker.post("/chats/:id/messages", (_req, res) => res.sendStatus(202));
  db = new BoardDatabase(":memory:");
  config = parseInternalTasksEnvironment({
    OPERATIONS_AGENT_PUBLIC_URL: origin,
    OPERATIONS_AGENT_API_URL: await listen(auth),
    OPERATIONS_AGENT_WORKER_URL: await listen(worker),
    OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
  });
  application = createApplication(config, db);
  base = await listen(application.app);
});
afterEach(async () => {
  await application.close();
  db.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("persists exactly one chat per task, replaces only the link and survives API restarts", async () => {
  const card = await task();
  const initial = await read<LiveBoardSnapshot>("/board");
  const first = await link(card.id, nativeChats[0]!.id);
  expect(await link(card.id, first.chatId)).toEqual(first);
  const second = await link(card.id, nativeChats[1]!.id);
  const board = await read<LiveBoardSnapshot>("/board");
  expect(board.version).not.toBe(initial.version);
  expect(board.taskChats).toEqual([second]);
  expect(await read(`/chats/${first.chatId}/task`)).toBeNull();
  expect(await read(`/chats/${second.chatId}/task`)).toMatchObject({ id: card.id });
  expect(
    (await read<Snapshot>("/snapshot?scope=general")).chats.map((chat) => chat.id),
  ).toContain(first.chatId);
  await application.close();
  application = createApplication(config, db);
  base = await listen(application.app);
  expect((await read<LiveBoardSnapshot>("/board")).taskChats).toEqual([second]);
  expect(calls.every((method) => method.startsWith("GET "))).toBe(true);
  expect(
    db.db
      .prepare("PRAGMA table_info(task_chat_links)")
      .all()
      .map((column) => column.name),
  ).toEqual(["taskId", "chatId", "createdAt"]);
});

it("rejects missing/unmaterialized chats and never creates IDs just by opening a task", async () => {
  const card = await task();
  const initial = await read<LiveBoardSnapshot>("/board");
  expect((await read<Snapshot>(`/snapshot?taskId=${card.id}`)).detail).toBeNull();
  expect(
    (await call(`/board/cards/${card.id}/chats`, { chatId: nativeChats[2]!.id })).status,
  ).toBe(409);
  expect((await call(`/board/cards/${card.id}/chats`, { chatId: randomUUID() })).status).toBe(
    404,
  );
  expect(await read<LiveBoardSnapshot>("/board")).toEqual(initial);
  expect(calls.every((method) => method.startsWith("GET "))).toBe(true);
});

it("separates general/task chats, resolves direct links, prevents cross-task links and handles title changes", async () => {
  const first = await task();
  const second = await task("Another task");
  const a = await link(first.id, nativeChats[0]!.id);
  const b = await link(second.id, nativeChats[1]!.id);
  expect((await read<Snapshot>("/snapshot?scope=tasks")).chats.map((chat) => chat.id)).toEqual([
    a.chatId,
    b.chatId,
  ]);
  const direct = await read<Snapshot>(`/snapshot?chatId=${a.chatId}`);
  expect(direct.chatScope).toBe("tasks");
  expect(direct.linkedTask?.id).toBe(first.id);
  expect(
    (await read<Snapshot>(`/snapshot?taskId=${second.id}&chatId=${b.chatId}`)).chats.map(
      (chat) => chat.id,
    ),
  ).toEqual([b.chatId]);
  expect((await call(`/snapshot?taskId=${first.id}&chatId=${b.chatId}`)).status).toBe(409);
  expect((await call(`/board/cards/${first.id}/chats`, { chatId: b.chatId })).status).toBe(409);
  await read(`/board/cards/${first.id}`, {
    revision: first.revision,
    title: "Updated title",
    archived: true,
  });
  const updated = await read<Snapshot>(`/snapshot?chatId=${a.chatId}`);
  expect(updated.linkedTask?.title).toBe("Updated title");
  expect(updated.linkedTask?.archivedAt).toBeTruthy();
  expect(updated.taskChats?.find((item) => item.chatId === a.chatId)?.taskTitle).toBe(
    "Updated title",
  );
});

it("keeps authentication, origin checks and Telegram confirmation in force", async () => {
  const card = await task();
  const body = { chatId: nativeChats[0]!.id };
  for (const [requestHeaders, expected] of [
    [{ Origin: origin, "Content-Type": "application/json" }, 401],
    [{ ...headers, Origin: "https://elsewhere.test" }, 403],
  ] as const) {
    expect(
      (
        await fetch(`${base}/api/board/cards/${card.id}/chats`, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(expected);
  }
  expect(
    (
      await call(`/chats/${body.chatId}/messages`, {
        requestId: randomUUID(),
        text: "Start",
        attachments: [],
      })
    ).status,
  ).toBe(403);
  expect(calls).toEqual([]);
});

it("keeps the previous association if worker validation fails", async () => {
  const card = await task();
  const previous = await link(card.id, nativeChats[0]!.id);
  workerUnavailable = true;
  expect(
    (await call(`/board/cards/${card.id}/chats`, { chatId: nativeChats[1]!.id })).status,
  ).toBe(503);
  expect((await read<LiveBoardSnapshot>("/board")).taskChats).toEqual([previous]);
});

it("saves a scoped verdict through the real Gateway helper and invalidates board SSE state", async () => {
  const card = await task();
  const chatId = nativeChats[0]!.id;
  await link(card.id, chatId);
  const before = await read<LiveBoardSnapshot>("/board");
  const directory = await mkdtemp(join(tmpdir(), "task-verdict-"));
  try {
    const token = verdictToken(config.workerToken, card.id, chatId, card.revision);
    const context = await prepareTaskContext(
      {
        task: card,
        tags: [],
        url: origin,
        verdict: {
          url: `${base}/api/agent/tasks/${card.id}/verdict`,
          token,
          chatId,
          revision: card.revision,
        },
      },
      directory,
    );
    expect(JSON.stringify(context)).not.toContain(token);
    expect("saveVerdictCommand" in context).toBe(true);
    const command = (context as { saveVerdictCommand: string }).saveVerdictCommand;
    const configFile = command.split("'")[3]!;
    expect((await stat(configFile)).mode & 0o777).toBe(0o600);
    const run = () =>
      new Promise<{ code: number | null; output: string }>((resolve) => {
        const child = spawn("sh", ["-c", command.replace(" < verdict.txt", "")]);
        let output = "";
        child.stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.on("close", (code) => resolve({ code, output }));
        child.stdin.end("Ready for implementation. Scope agreed; no blockers.");
      });
    const result = await run();
    expect(result.code, result.output).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({ saved: true, taskId: card.id });
    const after = await read<LiveBoardSnapshot>("/board");
    expect(after.version).not.toBe(before.version);
    expect(after.cards[0]).toMatchObject({
      agentVerdict: "Ready for implementation. Scope agreed; no blockers.",
      revision: card.revision + 1,
      status: card.status,
    });
    expect((await run()).code).toBe(0);
    const events = await read<{ type: string; payload: { actor: string } }[]>(
      `/board/cards/${card.id}/events`,
    );
    expect(events.filter((event) => event.payload.actor === "Codex")).toHaveLength(1);
    await read(`/board/cards/${card.id}`, {
      title: "Updated requirements",
      revision: card.revision + 1,
    });
    const stale = await run();
    expect(stale.code).toBe(1);
    expect(stale.output).toContain("fresh task snapshot");
    expect(stale.output).not.toContain(token);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects forged, cross-task, oversized and unlinked verdict writes", async () => {
  const card = await task();
  const other = await task("Other");
  const chatId = nativeChats[0]!.id;
  await link(card.id, chatId);
  const token = verdictToken(config.workerToken, card.id, chatId, card.revision);
  const submit = (id: string, bearer: string, verdict = "Ready", revision = card.revision) =>
    fetch(`${base}/api/agent/tasks/${id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ chatId, revision, verdict }),
    });
  expect((await submit(card.id, "")).status).toBe(403);
  expect((await submit(card.id, config.workerToken)).status).toBe(403);
  expect((await submit(other.id, token)).status).toBe(403);
  expect((await submit(card.id, token, "Ready", 2)).status).toBe(403);
  expect((await submit(card.id, token, " ")).status).toBe(400);
  expect((await submit(card.id, token, "x".repeat(8001))).status).toBe(400);
  await link(card.id, nativeChats[1]!.id);
  expect((await submit(card.id, token)).status).toBe(409);
  expect(
    (await read<LiveBoardSnapshot>("/board")).cards.every((item) => !item.agentVerdict),
  ).toBe(true);
});
