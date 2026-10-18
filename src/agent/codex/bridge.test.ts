import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentContext, Attachment, Snapshot, Thread } from "../../api/contracts/agent.js";
import { parseInternalTasksAgentEnvironment } from "../config.js";
import { createWorker } from "../app.js";
import { taskSchema } from "../../api/contracts/board.js";

const execute = promisify(execFile);
const token = "x".repeat(32);
let root: string;
let server: Server;
let worker: ReturnType<typeof createWorker>;
let base: string;
const call = (path: string, body?: unknown) =>
  fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "internal-tasks-bridge-"));
  await execute("git", ["init", "-b", "main", root]);
  await writeFile(join(root, "AGENTS.md"), "Use focused checks.");
  await execute("git", ["-C", root, "add", "."]);
  await execute("git", [
    "-C",
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "-m",
    "Fixture",
  ]);
  await writeFile(join(root, "app-instructions.md"), "Application instruction marker.");
  const binary = fileURLToPath(new URL("../testing/fixtures/codex.mjs", import.meta.url));
  await chmod(binary, 0o755);
  worker = createWorker(
    parseInternalTasksAgentEnvironment({
      OPERATIONS_AGENT_WORKER_TOKEN: token,
      OPERATIONS_AGENT_REPOSITORY: root,
      OPERATIONS_AGENT_WORKTREES: join(root, "worktrees"),
      OPERATIONS_AGENT_CODEX_HOME: join(root, "codex"),
      OPERATIONS_AGENT_CODEX_BINARY: binary,
      OPERATIONS_AGENT_INSTRUCTIONS_FILE: join(root, "app-instructions.md"),
      OPERATIONS_AGENT_SSH_MAIN_HOST: "main.test",
      OPERATIONS_AGENT_SSH_MAIN_USER: "admin",
      OPERATIONS_AGENT_SSH_MAIN_DIRECTORY: "/srv/app",
      OPERATIONS_AGENT_SSH_MAIN_PASSWORD: "ssh-secret-for-test",
    }),
    process.env.PATH ?? "",
  );
  server = worker.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Address");
  base = `http://127.0.0.1:${address.port}`;
});

it("reads native status without creating a chat or exposing private account/server data", async () => {
  const draft = await call("/session-status");
  expect(draft.status).toBe(200);
  const body = await draft.json();
  expect(body).toMatchObject({
    threadId: null,
    state: "ready",
    model: "fixture",
    effort: "medium",
    account: { type: "chatgpt", plan: "pro" },
    limitsAvailable: true,
    limits: [{ name: "Codex", primary: { usedPercent: 25, windowDurationMins: 300 } }],
  });
  expect(JSON.stringify(body)).not.toMatch(/private@example|ssh-secret|repository|password/u);
  expect(await worker.bridge.list()).toHaveLength(0);
  const nativeCall = vi.spyOn(worker.bridge.rpc, "call");
  nativeCall.mockResolvedValueOnce({
    account: { type: "chatgpt", planType: "pro" },
    requiresOpenaiAuth: true,
  });
  nativeCall.mockRejectedValueOnce(new Error("Rate limit service unavailable"));
  expect(await (await call("/session-status")).json()).toMatchObject({
    state: "ready",
    model: "fixture",
    limits: [],
    limitsAvailable: false,
  });
  nativeCall.mockRestore();
  expect((await call("/session-status?chatId=invalid")).status).toBe(400);
  expect((await fetch(base + "/session-status")).status).toBe(401);
  const first = (await (await call("/chats", {})).json()) as Thread;
  const second = (await (await call("/chats", {})).json()) as Thread;
  await call(`/chats/${first.id}/messages`, { text: "wait", requestId: randomUUID() });
  expect(await (await call(`/session-status?chatId=${first.id}`)).json()).toMatchObject({
    threadId: first.id,
    state: "working",
  });
  expect(await (await call(`/session-status?chatId=${second.id}`)).json()).toMatchObject({
    threadId: second.id,
    state: "ready",
  });
});

it("rereads one instruction file for existing chats without losing repository instructions", async () => {
  const thread = (await (await call("/chats", {})).json()) as Thread;
  const instructions = () => readFile(join(root, "codex/fixture-instructions.json"), "utf8");
  expect(await instructions()).toContain("Application instruction marker.");
  const context = (await (await call(`/context?chatId=${thread.id}`)).json()) as AgentContext;
  expect(context).not.toHaveProperty("instructionProfile");
  expect(context.instructions[0]?.path).toBe(join(root, "app-instructions.md"));
  expect(context.instructions.some((source) => source.text === "Use focused checks.")).toBe(
    true,
  );
  const send = async () => {
    expect(
      (await call(`/chats/${thread.id}/messages`, { text: "finish", requestId: randomUUID() }))
        .status,
    ).toBe(202);
    await expect.poll(() => worker.bridge.busy).toBe(false);
  };
  await send();
  await send();
  expect(await instructions()).toContain("Application instruction marker.");
  await writeFile(join(root, "app-instructions.md"), "Updated application instruction.");
  await send();
  expect(await instructions()).toContain("Updated application instruction.");
  expect((await worker.bridge.read(thread.id)).turns).toHaveLength(3);
  await writeFile(join(root, "app-instructions.md"), "");
  expect((await call("/chats", {})).status).toBe(502);
});

it("prepends database task data to native starts and steering without opening the browser", async () => {
  const thread = (await (await call("/chats", {})).json()) as Thread;
  const task = taskSchema.parse({
    id: "task-db",
    title: "Database title",
    description: "Current description",
    priority: "medium",
    status: "backlog",
    tagIds: [],
    order: 0,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachments: [],
    revision: 1,
  });
  const body = {
    text: "Discuss",
    requestId: randomUUID(),
    taskContext: { task, tags: [], url: "https://tasks.example/tasks?task=task-db" },
  };
  expect((await call(`/chats/${thread.id}/messages`, body)).status).toBe(202);
  await expect.poll(() => worker.bridge.busy).toBe(false);
  const user = (await worker.bridge.read(thread.id)).turns[0]?.items[0];
  expect(user).toMatchObject({
    type: "userMessage",
    content: [
      {
        type: "text",
        text: expect.stringContaining('"description":"Current description"') as string,
      },
    ],
  });
  // Keep a native turn open, then submit a task question response through turn/steer.
  expect(
    (await call(`/chats/${thread.id}/messages`, { text: "wait", requestId: randomUUID() }))
      .status,
  ).toBe(202);
  body.taskContext.task.description = "Updated from database";
  body.requestId = randomUUID();
  expect((await call(`/chats/${thread.id}/messages`, body)).status).toBe(202);
  expect(await readFile(join(root, "codex/fixture-instructions.json"), "utf8")).toContain(
    "Application instruction marker.",
  );
  const updated = await worker.bridge.read(thread.id);
  expect(updated.turns).toHaveLength(2);
  expect(updated.turns[1]?.items.at(-1)).toMatchObject({
    type: "userMessage",
    content: [
      { type: "text", text: expect.stringContaining("Updated from database") as string },
    ],
  });
  const activity = (await (await call(`/activity/${thread.id}`)).json()) as { id: string };
  expect(activity).toMatchObject({
    id: updated.turns[1]?.id,
    status: "inProgress",
    completedAt: null,
  });
  const previous = updated.turns[0]!;
  expect(
    await (await call(`/activity/${thread.id}?turnId=${previous.id}`)).json(),
  ).toMatchObject({
    id: previous.id,
    status: "completed",
    completedAt: expect.any(Number) as number,
  });
});

it("sends application instructions to native chats and exposes context without SSH passwords", async () => {
  const thread = (await (await call("/chats", {})).json()) as Thread;
  const instructions = () => readFile(join(root, "codex/fixture-instructions.json"), "utf8");
  expect(await instructions()).toContain("Application instruction marker.");
  const response = await call(`/context?chatId=${thread.id}`);
  expect(response.status).toBe(200);
  const context = (await response.json()) as AgentContext;
  expect(context.sshTargets[0]).toMatchObject({
    host: "main.test",
    authentication: "password",
  });
  expect(context.instructions[0]?.text).toBe("Application instruction marker.");
  expect(JSON.stringify(context)).not.toContain("ssh-secret-for-test");
  await writeFile(join(root, "app-instructions.md"), "Updated application instructions.");
  expect(
    (await call(`/chats/${thread.id}/messages`, { text: "finish", requestId: randomUUID() }))
      .status,
  ).toBe(202);
  await expect.poll(() => worker.bridge.busy).toBe(false);
  const native = JSON.parse(await instructions()) as {
    threadId: string;
    items: [{ role: string; content: [{ text: string }] }];
  };
  expect(native.threadId).toBe(thread.id);
  expect(native.items[0].role).toBe("developer");
  expect(native.items[0].content[0].text).toContain("Updated application instructions.");
  expect(JSON.stringify(native)).not.toContain("ssh-secret-for-test");
});
afterEach(async () => {
  await worker.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

it("preserves a turn that starts between the native header and history reads", async () => {
  const thread = (await (await call("/chats", {})).json()) as Thread;
  await call(`/chats/${thread.id}/messages`, { text: "wait", requestId: randomUUID() });
  const live = await worker.bridge.read(thread.id);
  const read = vi.spyOn(worker.bridge.rpc, "callWithCursor");
  read.mockResolvedValueOnce({
    value: { thread: { ...live, status: { type: "idle" }, turns: [] } },
    cursor: 0,
  });
  try {
    const snapshot = await worker.bridge.readWithCursor(thread.id);
    expect(snapshot.thread.status.type).toBe("active");
    expect(snapshot.thread.turns.at(-1)?.status).toBe("inProgress");
  } finally {
    read.mockRestore();
  }
});

it("steers the current native turn, accepts other chats, and deduplicates submissions without a queue", async () => {
  expect((await fetch(base + "/chats")).status).toBe(401);
  const first = (await (await call("/chats", {})).json()) as Thread;
  const second = (await (await call("/chats", {})).json()) as Thread;
  expect(first.cwd).toContain("/worktrees/");
  expect((await call(`/chats/${first.id}/name`, { name: "Hotfix" })).status).toBe(204);
  const input = { text: "wait", requestId: randomUUID(), attachments: [] };
  expect((await call(`/chats/${first.id}/messages`, input)).status).toBe(202);
  expect(
    (
      await call(`/chats/${first.id}/messages`, {
        ...input,
        text: "clarification",
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(202);
  const steered = await worker.bridge.read(first.id);
  expect(steered.turns).toHaveLength(1);
  expect(JSON.stringify(steered.turns[0]?.items)).toContain("clarification");
  expect((await call("/chats", {})).status).toBe(201);
  expect((await worker.bridge.read(second.id)).turns).toHaveLength(0);
  expect((await call("/drain", {})).status).toBe(409);
  expect((await call("/stop", {})).status).toBe(202);
  await expect.poll(() => worker.bridge.busy).toBe(false);
  const snapshot = (await (await call(`/snapshot?chatId=${first.id}`)).json()) as Snapshot;
  expect(snapshot.detail?.id).toBe(first.id);
  expect(snapshot.detail?.name).toBe("Hotfix");
  expect(snapshot.detail?.turns[0]?.status).toBe("interrupted");
  expect((await call(`/chats/${first.id}/messages`, input)).status).toBe(202);
  expect((await worker.bridge.read(first.id)).turns).toHaveLength(1);
  expect(
    (
      await call(`/chats/${first.id}/messages`, {
        ...input,
        text: "finish",
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(202);
  await expect.poll(() => worker.bridge.busy).toBe(false);
  expect((await worker.bridge.read(first.id)).turns).toHaveLength(2);
});

it("validates model settings and scopes compact and background process control to a native thread", async () => {
  const thread = (await (await call("/chats", {})).json()) as Thread;
  const path = `/chats/${thread.id}`;
  expect(
    (
      await call(`${path}/commands`, {
        command: "settings",
        model: "fixture",
        effort: "invented",
        serviceTier: null,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(`${path}/commands`, {
        command: "settings",
        model: "fixture",
        effort: "high",
        serviceTier: "priority",
      })
    ).status,
  ).toBe(202);
  expect(await worker.bridge.read(thread.id)).toMatchObject({
    model: "fixture",
    effort: "high",
    serviceTier: "priority",
  });
  const command = async () =>
    JSON.parse(await readFile(join(root, "codex/fixture-command.json"), "utf8")) as {
      method: string;
      params: object;
    };
  expect((await call(`${path}/commands`, { command: "compact" })).status).toBe(202);
  expect(await command()).toMatchObject({
    method: "thread/compact/start",
    params: { threadId: thread.id },
  });
  expect(await (await call(`${path}/terminals`)).json()).toMatchObject([{ processId: "p1" }]);
  expect((await call(`${path}/stop`, { target: "terminals", processId: "p1" })).status).toBe(
    202,
  );
  expect(await command()).toMatchObject({
    method: "thread/backgroundTerminals/terminate",
    params: { threadId: thread.id, processId: "p1" },
  });
  expect((await call(`${path}/stop`, { target: "terminals" })).status).toBe(202);
  expect(await command()).toMatchObject({
    method: "thread/backgroundTerminals/clean",
    params: { threadId: thread.id },
  });
});

it("passes image bytes as localImage, protects download boundaries, and rejects another thread attachments", async () => {
  const first = (await (await call("/chats", {})).json()) as Thread;
  const second = (await (await call("/chats", {})).json()) as Thread;
  const bytes = Buffer.from("89504e470d0a1a0a010203", "hex");
  const upload = await fetch(`${base}/chats/${first.id}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("../image.png"),
    },
    body: bytes,
  });
  expect(upload.status).toBe(201);
  const file = (await upload.json()) as Attachment;
  expect(file.name).toBe("image.png");
  expect(await readFile(file.path)).toEqual(bytes);
  const download = await call(`/files/${file.id}`);
  expect(download.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  const input = { text: "image", attachments: [file.id], requestId: randomUUID() };
  expect((await call(`/chats/${second.id}/messages`, input)).status).toBe(502);
  expect((await call(`/chats/${first.id}/messages`, input)).status).toBe(202);
  await expect.poll(() => worker.bridge.busy).toBe(false);
  const thread = await worker.bridge.read(first.id);
  const user = thread.turns[0]?.items[0];
  expect(user?.type).toBe("userMessage");
  if (user?.type === "userMessage")
    expect(user.content).toContainEqual({ type: "localImage", path: file.path });
  expect((await fetch(base + `/files/${file.id}`)).status).toBe(401);
});

it("streams raw notifications and forwards request answers without disconnecting the active turn", async () => {
  const thread = (await (await call("/chats", {})).json()) as Thread;
  const abort = new AbortController();
  const response = await fetch(base + "/events", {
    headers: { Authorization: `Bearer ${token}` },
    signal: abort.signal,
  });
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("bridge/connected");
  await call(`/chats/${thread.id}/messages`, { text: "approval", requestId: randomUUID() });
  let output = "";
  while (!output.includes("item/commandExecution/requestApproval"))
    output += new TextDecoder().decode((await reader.read()).value);
  expect(output).toContain("item/commandExecution/outputDelta");
  abort.abort();
  expect(worker.bridge.busy).toBe(true);
  expect(
    (await call("/requests/respond", { id: "approval-1", result: { decision: "accept" } }))
      .status,
  ).toBe(204);
  await expect.poll(() => worker.bridge.busy).toBe(false);
  expect((await worker.bridge.read(thread.id)).turns[0]?.status).toBe("completed");
});

it.each(["accept", "decline", "cancel"])(
  "forwards a native MCP %s response with request ID zero",
  async (action) => {
    const thread = (await (await call("/chats", {})).json()) as Thread;
    await call(`/chats/${thread.id}/messages`, {
      text: "mcp-approval",
      requestId: randomUUID(),
    });
    const snapshot = (await (await call(`/snapshot?chatId=${thread.id}`)).json()) as Snapshot;
    expect(snapshot.requests).toContainEqual(
      expect.objectContaining({ id: 0, method: "mcpServer/elicitation/request" }),
    );
    const result = { action, content: action === "accept" ? {} : null, _meta: null };
    expect((await call("/requests/respond", { id: 0, result })).status).toBe(204);
    await expect.poll(() => worker.bridge.busy).toBe(false);
    expect(
      JSON.parse(await readFile(join(root, "codex/fixture-response.json"), "utf8")),
    ).toEqual({ id: 0, result });
    expect(worker.bridge.rpc.requests.size).toBe(0);
    expect((await worker.bridge.read(thread.id)).turns.at(-1)?.status).toBe("completed");
  },
);
