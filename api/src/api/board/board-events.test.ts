import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createApplication } from "../app.js";
import { parseInternalTasksEnvironment } from "../config.js";
import type { LiveBoardSnapshot, Task, TaskTag } from "../contracts/board.js";
import type { TaskComment } from "../contracts/task-comments.js";
import { createHash, randomUUID } from "node:crypto";
import { BoardDatabase } from "./database.js";
import { localAdminCookieToken, localAuthTestEnvironment } from "../auth/test-support.js";

let servers: Server[];
let application: ReturnType<typeof createApplication>;
let database: BoardDatabase;
let base: string;
const origin = "https://tasks.example.test";
let cookie: string;
const controllers: AbortController[] = [];
const listen = async (app: express.Express) => {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Address");
  return `http://127.0.0.1:${address.port}`;
};
const call = (path: string, body?: unknown) =>
  fetch(`${base}/api/board${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const snapshot = async () => (await (await call("")).json()) as LiveBoardSnapshot;
const postComment = (
  cardId: string,
  id: string,
  text: string,
  files: File[] = [],
  headers = { Cookie: cookie, Origin: origin },
) => {
  const body = new FormData();
  body.set("id", id);
  body.set("text", text);
  files.forEach((file) => body.append("files", file));
  return fetch(`${base}/api/board/cards/${cardId}/comments`, { method: "POST", headers, body });
};

const connect = async () => {
  const abort = new AbortController();
  controllers.push(abort);
  const response = await fetch(`${base}/api/board/events`, {
    headers: { Cookie: cookie },
    signal: abort.signal,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(response.headers.get("x-accel-buffering")).toBe("no");
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  const next = async (): Promise<string> => {
    for (;;) {
      const index = buffered.indexOf("\n\n");
      if (index >= 0) {
        const frame = buffered.slice(0, index);
        buffered = buffered.slice(index + 2);
        const data = frame.split("\n").find((line) => line.startsWith("data: "));
        if (data) return (JSON.parse(data.slice(6)) as { version: string }).version;
      } else {
        const part = await reader.read();
        if (part.done) throw Error("SSE ended before a board change");
        buffered += part.value;
      }
    }
  };
  return { next, reader, abort };
};

beforeEach(async () => {
  servers = [];
  database = new BoardDatabase(":memory:");
  const config = parseInternalTasksEnvironment({
    ...localAuthTestEnvironment,
    OPERATIONS_AGENT_PUBLIC_URL: origin,
    OPERATIONS_AGENT_WORKER_URL: "http://127.0.0.1:1",
    OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
  });
  cookie = `amazi_operations_session=${localAdminCookieToken(config)}`;
  application = createApplication(config, database);
  base = await listen(application.app);
});

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await application.close();
  database.close();
  vi.useRealTimers();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("authenticates board SSE and broadcasts each committed task, tag and attachment change to all clients", async () => {
  expect((await fetch(`${base}/api/board/events`)).status).toBe(401);
  const first = await connect();
  const second = await connect();
  let previous = (await snapshot()).version;
  expect(await first.next()).toBe(previous);
  expect(await second.next()).toBe(previous);
  const changed = async () => {
    const next = (await snapshot()).version;
    expect(next).not.toBe(previous);
    expect(await first.next()).toBe(next);
    expect(await second.next()).toBe(next);
    previous = next;
  };
  const input = {
    title: "Task",
    description: null,
    priority: "medium",
    status: "backlog",
    tagIds: [],
  };
  let task = (await (await call("/cards", input)).json()) as Task;
  await changed();
  const tag = (await (await call("/tags", { name: "UI", tone: "blue" })).json()) as TaskTag;
  await changed();
  await call(`/tags/${tag.id}`, { name: "Frontend", tone: "violet" });
  await changed();
  task = (await (
    await call(`/cards/${task.id}`, {
      revision: task.revision,
      title: "Updated",
      tagIds: [tag.id],
    })
  ).json()) as Task;
  await changed();
  // Invalid/stale writes must not change the stream version or add an event frame.
  expect((await call(`/cards/${task.id}`, { revision: 1, title: "Stale" })).status).toBe(409);
  expect((await call("/tags", { name: "Frontend", tone: "violet" })).status).toBe(409);
  expect((await snapshot()).version).toBe(previous);
  task = (await (
    await fetch(`${base}/api/board/cards/${task.id}/attachments`, {
      method: "POST",
      body: Buffer.from("file"),
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/octet-stream",
        "X-Task-Revision": String(task.revision),
        "X-File-Name": "file.txt",
        "X-Attachment-Id": "file",
      },
    })
  ).json()) as Task;
  await changed();
  task = (await (
    await call(`/cards/${task.id}/attachments/file/remove`, { revision: task.revision })
  ).json()) as Task;
  await changed();
  await call(`/tags/${tag.id}/remove`, {});
  await changed();
  task = (await snapshot()).cards[0]!;
  for (const archived of [true, false]) {
    task = (await (
      await call(`/cards/${task.id}`, { revision: task.revision, archived })
    ).json()) as Task;
    await changed();
  }
  first.abort.abort();
  second.abort.abort();
  // Reconnection exposes the current version, including changes missed while disconnected.
  await call(`/cards/${task.id}`, { revision: task.revision, title: "While offline" });
  const reconnected = await connect();
  expect(await reconnected.next()).toBe((await snapshot()).version);
});

it("ends the authenticated stream after one minute and closes live connections on shutdown", async () => {
  // Only the server's interval/timeout scheduling is virtual; requests use real HTTP sockets.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  const stream = await connect();
  await stream.next();
  await vi.advanceTimersByTimeAsync(60_000);
  while (!(await stream.reader.read()).done) {
    /* drain heartbeat comments */
  }
  vi.useRealTimers();
  const resumed = await connect();
  await resumed.next();
  await application.close();
  expect((await resumed.reader.read()).done).toBe(true);
});

it("persists comments and binary attachments atomically, broadcasts SSE, and retries without duplicates", async () => {
  const input = {
    title: "Discuss design",
    description: null,
    status: "clarification",
    priority: "medium",
    tagIds: [],
  };
  const created = await call("/cards", input);
  expect(created.status).toBe(201);
  const task = (await created.json()) as Task;
  const stream = await connect();
  const initial = await stream.next();
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 13, 10]);
  const file = new File([bytes], "референс.png", { type: "image/png" });
  const id = randomUUID();
  const saved = await postComment(task.id, id, "  Design reference  ", [file]);
  expect(saved.status).toBe(201);
  const comment = (await saved.json()) as TaskComment;
  expect(comment.text).toBe("Design reference");
  expect(comment.author.name).toBe("Admin");
  expect(comment.attachments[0]).toMatchObject({
    name: "референс.png",
    size: bytes.length,
    type: "image/png",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  expect(await stream.next()).not.toBe(initial);
  expect(await (await call(`/cards/${task.id}/comments`)).json()).toEqual([comment]);
  const download = await call(`/cards/${task.id}/attachments/${comment.attachments[0]!.id}`);
  expect(download.status).toBe(200);
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  expect((await snapshot()).cards[0]).toMatchObject({
    status: "clarification",
    revision: 2,
    attachments: [],
  });
  expect((await postComment(task.id, id, "Design reference", [file])).status).toBe(201);
  expect((await snapshot()).cards[0]!.revision).toBe(2);
  expect(await (await call(`/cards/${task.id}/comments`)).json()).toHaveLength(1);
  expect(await (await call(`/cards/${task.id}/events`)).json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "comment_added" })]),
  );
  expect((await postComment(task.id, id, "Changed payload", [file])).status).toBe(409);
  const second = (await (await call("/cards", input)).json()) as Task;
  expect(
    (await call(`/cards/${second.id}/attachments/${comment.attachments[0]!.id}`)).status,
  ).toBe(404);
  expect((await postComment(second.id, id, "Design reference", [file])).status).toBe(409);
  expect((await call(`/cards/${task.id}`, { revision: 2, status: "queue" })).status).toBe(200);
});

it("rejects empty, unauthenticated, invalid and oversized comment uploads without changing the task", async () => {
  const task = (await (
    await call("/cards", {
      title: "Task",
      description: null,
      status: "queue",
      priority: "low",
      tagIds: [],
    })
  ).json()) as Task;
  expect(
    (await postComment(task.id, randomUUID(), "Hello", [], { Cookie: "", Origin: origin }))
      .status,
  ).toBe(401);
  expect(
    (
      await postComment(task.id, randomUUID(), "Hello", [], {
        Cookie: cookie,
        Origin: "https://wrong.example",
      })
    ).status,
  ).toBe(403);
  expect((await postComment(task.id, randomUUID(), "  ")).status).toBe(400);
  expect((await postComment(task.id, randomUUID(), "x".repeat(8001))).status).toBe(400);
  expect(
    (await postComment(task.id, randomUUID(), "", [new File([], "empty.txt")])).status,
  ).toBe(400);
  expect(
    (
      await postComment(
        task.id,
        randomUUID(),
        "",
        Array.from({ length: 11 }, () => new File(["x"], "file.txt")),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await postComment(task.id, randomUUID(), "", [
        new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.bin"),
      ])
    ).status,
  ).toBe(413);
  expect((await snapshot()).cards[0]!.revision).toBe(1);
  expect(await (await call(`/cards/${task.id}/comments`)).json()).toEqual([]);
  expect(
    (await postComment(task.id, randomUUID(), "", [new File(["reference"], "note.txt")]))
      .status,
  ).toBe(201);
});
