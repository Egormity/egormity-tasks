import { parseInternalTasksEnvironment, internalTasksPolicy as policy } from "./config.js";
import express from "express";

import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { BoardSnapshot, Task, TaskTag } from "./contracts/board.js";

import * as tracker from "../web/features/board/data/tracker-api";

import { createApplication } from "./app.js";
import { BoardDatabase } from "./board/database.js";

let servers: Server[];

let application: ReturnType<typeof createApplication>;

let store: BoardDatabase;

let base: string;

let role: string;

let heldResponse: express.Response | undefined;

let runs: number;

let workerAvailable: boolean;

const token = "test-admin-session";

const user = () => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Administrator",
  email: "admin@example.test",
  role,
  access: {},
  supportRepliesAwaitingUserCount: 0,
});

const listen = async (app: express.Express) => {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Invalid test address");
  return `http://127.0.0.1:${address.port}`;
};

const call = (
  path: string,
  body?: unknown,
  authenticated = true,
  origin = "https://operations.example.test",
) =>
  fetch(`${base}${policy.apiPath}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(authenticated ? { Cookie: `${policy.cookieName}=${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(async () => {
  servers = [];
  role = "admin";
  runs = 0;
  workerAvailable = true;
  heldResponse = undefined;
  const auth = express();
  auth.use(express.json());
  auth.post("/auth/token", (_request, response) => response.json({ token, user: user() }));
  auth.get("/auth/session", (_request, response) => response.json({ user: user() }));
  auth.post("/auth/logout", (_request, response) => response.sendStatus(204));
  const worker = express.Router();
  worker.use(express.json());
  worker.get("/status", (_request, response) =>
    response.status(workerAvailable ? 200 : 503).json({
      authenticated: true,
      busy: Boolean(heldResponse),
      loginOutput: "",
      loginRunning: false,
    }),
  );
  worker.get("/chats", (_request, response) => response.json([]));
  worker.post("/run", (_request, response) => {
    runs += 1;
    heldResponse = response;
    response.setHeader("Content-Type", "application/x-ndjson");
    response.write(`${JSON.stringify({ type: "thread", threadId: "test-thread" })}\n`);
  });
  worker.post("/stop", (_request, response) => {
    heldResponse?.end(`${JSON.stringify({ type: "done", status: "stopped" })}\n`);
    heldResponse = undefined;
    response.sendStatus(202);
  });
  const gateway = express();
  gateway.use("/operations-agent", worker);
  store = new BoardDatabase(":memory:");
  application = createApplication(
    parseInternalTasksEnvironment({
      OPERATIONS_AGENT_PUBLIC_URL: "https://operations.example.test/",
      OPERATIONS_AGENT_API_URL: await listen(auth),
      OPERATIONS_AGENT_WORKER_URL: `${await listen(gateway)}/operations-agent/`,
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
    }),
    store,
  );
  base = await listen(application.app);
});

afterEach(async () => {
  await application.close();
  store.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("protects all chat data, rejects non-admins, and rechecks revoked roles", async () => {
  expect((await call("/chats", undefined, false)).status).toBe(401);
  expect((await call("/chats")).status).toBe(200);
  role = "manager";
  expect((await call("/chats")).status).toBe(403);
  expect(
    (await call("/login", { email: "user@example.test", password: "password" }, false)).status,
  ).toBe(403);
});

it("uses an HttpOnly secure cookie and rejects cross-origin mutations", async () => {
  const response = await call(
    "/login",
    { email: "admin@example.test", password: "password" },
    false,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  expect(await response.text()).not.toContain(token);
  expect((await call("/chats", {}, true, "https://attacker.example.test")).status).toBe(403);
});

it("protects the board, preserves ordering, rejects stale edits and never launches Codex for a card", async () => {
  expect((await call("/board", undefined, false)).status).toBe(401);
  const input = {
    title: "First task",
    description: "Details",
    status: "queue",
    priority: "high",
    tagIds: [],
  };
  expect(
    (await call("/board/cards", input, true, "https://attacker.example.test")).status,
  ).toBe(403);
  expect((await call("/board/cards", { ...input, tagIds: ["missing"] })).status).toBe(400);
  const tag = (await (
    await call("/board/tags", { name: "Platform", tone: "blue" })
  ).json()) as TaskTag;
  const first = (await (
    await call("/board/cards", { ...input, tagIds: [tag.id] })
  ).json()) as Task;
  const second = (await (
    await call("/board/cards", { ...input, title: "Second task" })
  ).json()) as Task;
  expect(
    (await call(`/board/cards/${second.id}`, { revision: second.revision, beforeId: first.id }))
      .status,
  ).toBe(200);
  let snapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(snapshot.cards.map((card) => card.id)).toEqual([second.id, first.id]);
  expect(
    (
      await call(`/board/cards/${first.id}`, {
        revision: first.revision,
        title: "Stale overwrite",
      })
    ).status,
  ).toBe(409);
  const current = snapshot.cards.find((card) => card.id === first.id)!;
  const archived = (await (
    await call(`/board/cards/${first.id}`, { revision: current.revision, archived: true })
  ).json()) as Task;
  expect(archived.archivedAt).not.toBeNull();
  expect(
    (
      await call(`/board/cards/${first.id}`, {
        revision: archived.revision,
        archived: false,
        status: "done",
      })
    ).status,
  ).toBe(200);
  workerAvailable = false;
  snapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(snapshot.cards.find((card) => card.id === first.id)).toMatchObject({
    archivedAt: null,
    status: "done",
    tagIds: [tag.id],
  });
  expect(runs).toBe(0);
  role = "user";
  expect((await call("/board")).status).toBe(403);
  expect((await call("/board/cards", input)).status).toBe(403);
});

it("stores authenticated binary attachments and serves them only as downloads", async () => {
  const card = (await (
    await call("/board/cards", {
      title: "With file",
      description: null,
      status: "backlog",
      priority: "medium",
      tagIds: [],
    })
  ).json()) as Task;
  const bytes = Buffer.from("<script>untrusted source attachment</script>");
  const upload = await fetch(`${base}/api/board/cards/${card.id}/attachments`, {
    method: "POST",
    headers: {
      Origin: "https://operations.example.test",
      Cookie: `${policy.cookieName}=${token}`,
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("Вложение.html"),
      "X-Task-Revision": String(card.revision),
      "X-Attachment-Id": "source-ui-file-id",
      "X-File-Type": "text/html",
    },
    body: bytes,
  });
  expect(upload.status).toBe(201);
  const updated = (await upload.json()) as Task;
  const attachment = updated.attachments[0]!;
  expect(attachment).toMatchObject({ id: "source-ui-file-id", type: "text/html" });
  const path = `/board/cards/${card.id}/attachments/${attachment.id}`;
  expect((await call(path, undefined, false)).status).toBe(401);
  const download = await call(path);
  expect(download.headers.get("content-disposition")).toContain("attachment;");
  expect(download.headers.get("content-type")).toContain("application/octet-stream");
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  expect((await call(`${path}/remove`, { revision: card.revision })).status).toBe(409);
  expect((await call(`${path}/remove`, { revision: updated.revision })).status).toBe(200);
  expect((await call(path)).status).toBe(404);
});

it("atomically saves content with attachment removal and detaches deleted tags without deleting cards", async () => {
  const tag = (await (
    await call("/board/tags", { name: "Temporary", tone: "green" })
  ).json()) as TaskTag;
  const card = (await (
    await call("/board/cards", {
      title: "Original",
      description: null,
      status: "backlog",
      priority: "medium",
      tagIds: [tag.id],
    })
  ).json()) as Task;
  const upload = await fetch(`${base}/api/board/cards/${card.id}/attachments`, {
    method: "POST",
    headers: {
      Origin: "https://operations.example.test",
      Cookie: `${policy.cookieName}=${token}`,
      "Content-Type": "application/octet-stream",
      "X-File-Name": "example.txt",
      "X-Task-Revision": String(card.revision),
    },
    body: "example",
  });
  const attached = (await upload.json()) as Task;
  expect(
    (
      await call(`/board/cards/${card.id}`, {
        revision: card.revision,
        title: "Stale",
        attachmentIds: [],
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(`/board/cards/${card.id}`, {
        revision: attached.revision,
        title: "Invalid",
        attachmentIds: ["unknown"],
      })
    ).status,
  ).toBe(400);
  let snapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(snapshot.cards[0]).toMatchObject({
    title: "Original",
    attachments: attached.attachments,
  });
  const saved = (await (
    await call(`/board/cards/${card.id}`, {
      revision: attached.revision,
      title: "Updated",
      attachmentIds: [],
    })
  ).json()) as Task;
  expect(saved).toMatchObject({ title: "Updated", attachments: [] });
  expect((await call(`/board/tags/${tag.id}/remove`, {}, false)).status).toBe(401);
  expect(
    (await call(`/board/tags/${tag.id}/remove`, {}, true, "https://attacker.example.test"))
      .status,
  ).toBe(403);
  expect(await (await call(`/board/tags/${tag.id}/remove`, {})).json()).toEqual({
    id: tag.id,
    removedCards: 1,
  });
  snapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(snapshot.tags).toEqual([]);
  expect(snapshot.cards).toHaveLength(1);
  expect(snapshot.cards[0]).toMatchObject({
    id: card.id,
    title: "Updated",
    tagIds: [],
    revision: saved.revision + 1,
  });
  expect(
    (
      await call(`/board/cards/${card.id}`, {
        revision: saved.revision,
        title: "Stale tag edit",
      })
    ).status,
  ).toBe(409);
});

it("connects the copied frontend adapter to real HTTP storage without bypassing revisions", async () => {
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    if (typeof input !== "string" || !input.startsWith("/")) return nativeFetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("Origin", "https://operations.example.test");
    headers.set("Cookie", `${policy.cookieName}=${token}`);
    return nativeFetch(new URL(input, base), { ...init, headers });
  });
  try {
    const tag = await tracker.createTrackerTag("Frontend", "violet");
    await tracker.getTrackerTags();
    const created = await tracker.createTrackerCard({
      title: "Copied card",
      description: "Details",
      tagIds: [tag.id],
      attachments: [],
    });
    expect(created).toMatchObject({ status: "backlog", tags: [{ id: tag.id }] });
    const original = (await tracker.getTrackerCards("active", "Frontend")).items[0]!;
    const saved = await tracker.updateTrackerCard(original.id, {
      revision: original.revision,
      title: "Edited",
      attachments: [],
      tagIds: [tag.id],
    });
    await tracker.uploadTrackerCardAttachment(
      saved.id,
      "chosen-file",
      new File(["hello"], "note.txt", { type: "text/plain" }),
    );
    const current = (await tracker.getTrackerCards("active", "Edited")).items[0]!;
    expect(current.attachments[0]).toMatchObject({
      id: "chosen-file",
      name: "note.txt",
      type: "text/plain",
    });
    expect(current.attachments[0]?.objectId).toBeTruthy();
    expect(
      await (await tracker.getTrackerCardAttachmentBlob(current.id, "chosen-file")).text(),
    ).toBe("hello");
    await expect(
      tracker.updateTrackerCard(original.id, {
        revision: original.revision,
        title: "Lost update",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const archived = await tracker.archiveTrackerCard(current);
    expect((await tracker.getTrackerCards("active", "")).items).toHaveLength(0);
    expect((await tracker.getTrackerCards("archived", "")).items).toHaveLength(1);
    const restored = await tracker.restoreTrackerCard(archived);
    await tracker.updateTrackerCard(restored.id, {
      revision: restored.revision,
      attachments: [],
    });
    await tracker.deleteTrackerTag(tag.id);
    const final = (await tracker.getTrackerCards("active", "")).items[0]!;
    expect(final).toMatchObject({
      title: "Edited",
      tags: [],
      attachments: [],
      archivedAt: null,
    });
    expect((await tracker.getTrackerEvents(final.id)).items.length).toBeGreaterThan(4);
    expect(runs).toBe(0);
  } finally {
    vi.unstubAllGlobals();
    tracker.resetTrackerState();
  }
});

it("persists the indicated sibling after a concurrent insertion and rejects a vanished target", async () => {
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    if (typeof input !== "string" || !input.startsWith("/")) return nativeFetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("Origin", "https://operations.example.test");
    headers.set("Cookie", `${policy.cookieName}=${token}`);
    return nativeFetch(new URL(input, base), { ...init, headers });
  });
  try {
    const create = async (title: string, status: string) =>
      (await (
        await call("/board/cards", {
          title,
          description: null,
          priority: "medium",
          status,
          tagIds: [],
        })
      ).json()) as Task;
    const source = await create("Dragged", "backlog");
    const first = await create("First", "queue");
    const target = await create("Target", "queue");
    await tracker.getTrackerCards("active", "");
    const concurrent = await create("Concurrent", "queue");
    expect(
      (
        await call(`/board/cards/${concurrent.id}`, {
          revision: concurrent.revision,
          beforeId: target.id,
        })
      ).status,
    ).toBe(200);
    await tracker.getTrackerCards("active", "");
    await tracker.updateTrackerCard(source.id, {
      revision: source.revision,
      status: "queue",
      beforeId: target.id,
    });
    const board = (await tracker.getTrackerCards("active", "")).items;
    expect(board.filter((card) => card.status === "queue").map((card) => card.id)).toEqual([
      first.id,
      concurrent.id,
      source.id,
      target.id,
    ]);
    const another = await create("Another drag", "backlog");
    const currentTarget = board.find((card) => card.id === target.id)!;
    await tracker.archiveTrackerCard(currentTarget);
    await expect(
      tracker.updateTrackerCard(another.id, {
        revision: another.revision,
        status: "queue",
        beforeId: target.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await tracker.getTrackerCards("active", "")).items.find((card) => card.id === another.id)
        ?.status,
    ).toBe("backlog");
  } finally {
    vi.unstubAllGlobals();
    tracker.resetTrackerState();
  }
});
