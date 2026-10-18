import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApplication } from "../app.js";
import { parseInternalTasksEnvironment } from "../config.js";
import { BoardDatabase } from "../board/database.js";
import { confirmationPolicy } from "./confirmation-store.js";
import type { Task } from "../contracts/board.js";
import { TaskChatStore } from "../task-agent/task-chat-store.js";
import {
  confirmationPath,
  type ConfirmationAction,
  type ConfirmationChallenge,
} from "../contracts/confirmation.js";

const servers: Server[] = [];
let store: BoardDatabase;
let base: string;
let configured = true;
let role = "admin";
let deliveryStatus = 200;
let delivered: {
  chat_id: string;
  message_thread_id: number;
  text: string;
  protect_content: boolean;
}[];
let forwarded: { path: string; body: unknown; credential: string | undefined }[];
let legacyProfileHeaders: (string | undefined)[];
let wrongTopic = false;
let now: number;
let activity: { id: string; status: string; completedAt: number | null } | null;
const userId = randomUUID();
const token = "test-session";
const action = (): ConfirmationAction => ({
  kind: "message",
  chatId: randomUUID(),
  input: { text: "Fix the test fixture", requestId: randomUUID(), attachments: [] },
});
const listen = async (app: express.Express) => {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Address");
  return `http://127.0.0.1:${address.port}`;
};
const call = (
  path: string,
  body?: unknown,
  session = token,
  origin = "https://tasks.example.test",
) =>
  fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Cookie: `amazi_operations_session=${session}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const code = () => {
  const value = delivered.at(-1)?.text.match(/\nКод: (\d{6})\n/u)?.[1];
  if (!value) throw Error("Missing delivered code");
  return value;
};
const prepare = async (input: ConfirmationAction) => {
  const response = await call("/confirmations", input);
  expect(response.status).toBe(201);
  const challenge = (await response.json()) as ConfirmationChallenge;
  return { challenge, proof: { id: challenge.id, code: code() } };
};
const start = async () => {
  const auth = express();
  auth.get("/auth/session", (_req, res) =>
    res.json({ user: { id: userId, name: "Test", email: "admin@example.test", role } }),
  );
  const telegram = express();
  telegram.use(express.json());
  telegram.post("/sendMessage", (req, res) => {
    expect(req.headers.authorization).toBe("Bearer gateway-credential");
    delivered.push(req.body as (typeof delivered)[number]);
    res.status(deliveryStatus).json({
      ok: deliveryStatus === 200,
      result: {
        chat: { id: -1004381042765 },
        message_id: 211,
        message_thread_id: wrongTopic ? 4 : 210,
      },
    });
  });
  const worker = express();
  worker.use(express.json());
  worker.get("/activity/:id", (_req, res) => res.json(activity));
  worker.get("/snapshot", (_req, res) => res.json({ requests: [] }));
  worker.use((req, res) => {
    legacyProfileHeaders.push(req.get("x-amazi-instruction-profile"));
    forwarded.push({
      path: req.path,
      body: req.body as unknown,
      credential: req.headers.authorization,
    });
    res.sendStatus(202);
  });
  const telegramUrl = await listen(telegram);
  store = new BoardDatabase(":memory:");
  const { app } = createApplication(
    parseInternalTasksEnvironment({
      OPERATIONS_AGENT_PUBLIC_URL: "https://tasks.example.test",
      OPERATIONS_AGENT_API_URL: await listen(auth),
      OPERATIONS_AGENT_WORKER_URL: await listen(worker),
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
      ...(configured
        ? {
            OPERATIONS_AGENT_TELEGRAM_URL: telegramUrl + "/sendMessage",
            OPERATIONS_AGENT_TELEGRAM_TOKEN: "gateway-credential",
            OPERATIONS_AGENT_TELEGRAM_CHAT_ID: "-1004381042765",
            OPERATIONS_AGENT_TELEGRAM_THREAD_ID: "210",
          }
        : {}),
    }),
    store,
  );
  base = await listen(app);
};

it("relays the read-only Codex status for admins without asking for a Telegram code", async () => {
  await start();
  expect((await call(`/session-status?chatId=${randomUUID()}`)).status).toBe(202);
  expect(forwarded).toMatchObject([
    { path: "/session-status", credential: `Bearer ${"x".repeat(32)}` },
  ]);
  expect(delivered).toHaveLength(0);
  role = "user";
  expect((await call("/session-status", undefined, "other-session")).status).toBe(403);
});
beforeEach(() => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  configured = true;
  role = "admin";
  deliveryStatus = 200;
  wrongTopic = false;
  delivered = [];
  forwarded = [];
  legacyProfileHeaders = [];
  activity = null;
});
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  store?.close();
  vi.restoreAllMocks();
});

it("requires admin authentication and origin checks before sending any Telegram message", async () => {
  await start();
  expect((await call("/confirmations", action(), "")).status).toBe(401);
  expect((await call("/confirmations", action(), token, "https://attacker.test")).status).toBe(
    403,
  );
  role = "user";
  expect((await call("/confirmations", action())).status).toBe(403);
  expect(delivered).toHaveLength(0);
});

it("requires a code, delivers only to the fixed topic, and consumes it once before relaying", async () => {
  await start();
  const input = action();
  const path = confirmationPath(input);
  expect((await call(path, input.input)).status).toBe(403);
  expect(forwarded).toHaveLength(0);
  const { challenge, proof } = await prepare(input);
  expect(challenge).toEqual({
    id: proof.id,
    expiresAt: now + confirmationPolicy.lifetime,
    resendAt: now + confirmationPolicy.cooldown,
    telegramUrl: "https://t.me/c/4381042765/210",
  });
  expect(delivered[0]).toMatchObject({
    chat_id: "-1004381042765",
    message_thread_id: 210,
    protect_content: true,
  });
  const results = await Promise.all([
    call(path, { ...input.input, confirmation: proof }),
    call(path, { ...input.input, confirmation: proof }),
  ]);
  expect(results.map((res) => res.status).sort()).toEqual([202, 403]);
  expect(forwarded).toEqual([
    { path, body: input.input, credential: `Bearer ${"x".repeat(32)}` },
  ]);
});

it("supplies trusted task context from selection and saved links, with task ID bound to confirmation", async () => {
  await start();
  const createTask = async () =>
    (await (
      await call("/board/cards", {
        title: "Discuss",
        description: "Task context",
        priority: "medium",
        status: "backlog",
        tagIds: [],
      })
    ).json()) as Task;
  const task = await createTask();
  const otherTask = await createTask();
  await call("/chats", {});
  await call("/chats", { taskId: task.id });
  await call(`/context?taskId=${task.id}`);
  expect((await call("/chats", { taskId: "missing" })).status).toBe(404);

  // Legacy browser headers cannot select instructions on Gateway.
  await fetch(base + "/api/chats", {
    method: "POST",
    headers: {
      Cookie: `amazi_operations_session=${token}`,
      Origin: "https://tasks.example.test",
      "Content-Type": "application/json",
      "x-amazi-instruction-profile": "board",
    },
    body: "{}",
  });
  expect(legacyProfileHeaders.every((header) => header === undefined)).toBe(true);

  const message = action();
  if (message.kind !== "message") throw Error("Fixture");
  message.input.taskId = task.id;
  const { proof } = await prepare(message);
  expect(
    (
      await call(confirmationPath(message), {
        ...message.input,
        taskId: otherTask.id,
        confirmation: proof,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(confirmationPath(message), {
        ...message.input,
        taskContext: { task: { title: "Forged" } },
        confirmation: proof,
      })
    ).status,
  ).toBe(202);
  expect(forwarded.at(-1)?.body).toMatchObject({
    taskContext: {
      task: { id: task.id, title: "Discuss", description: "Task context" },
      tags: [],
      url: `https://tasks.example.test/tasks?task=${task.id}`,
    },
  });

  const links = new TaskChatStore(store.db);
  links.link(task.id, message.chatId);
  await call(`/context?chatId=${message.chatId}`);
  expect((await call(`/context?chatId=${message.chatId}&taskId=${otherTask.id}`)).status).toBe(
    409,
  );
  delete message.input.taskId;
  message.input.requestId = randomUUID();
  expect(await (await call("/confirmations", message)).json()).toEqual({ confirmed: true });
  expect((await call(confirmationPath(message), message.input)).status).toBe(202);
  expect(forwarded.at(-1)?.body).toMatchObject({ taskContext: { task: { id: task.id } } });
  links.link(task.id, randomUUID());
  await call(`/context?chatId=${message.chatId}`);
  message.input.requestId = randomUUID();
  expect((await call(confirmationPath(message), message.input)).status).toBe(202);
  expect(forwarded.at(-1)?.body).not.toHaveProperty("taskContext");
  expect(legacyProfileHeaders.every((header) => header === undefined)).toBe(true);
});

it("binds codes to the browser session, message, request ID, attachments, model settings and chat", async () => {
  await start();
  const input = action();
  if (input.kind !== "message") throw Error("Fixture");
  input.input.settings = { model: "fixture", effort: "high", serviceTier: "priority" };
  const { proof } = await prepare(input);
  const path = confirmationPath(input);
  const body = { ...input.input, confirmation: proof };
  expect((await call(path, body, "another-admin-session")).status).toBe(403);
  expect((await call(path, { ...body, text: "Run an unrelated command" })).status).toBe(403);
  expect((await call(path, { ...body, requestId: randomUUID() })).status).toBe(403);
  expect((await call(path, { ...body, attachments: [randomUUID()] })).status).toBe(403);
  expect(
    (await call(path, { ...body, settings: { ...body.settings, effort: "low" } })).status,
  ).toBe(403);
  expect((await call(`/chats/${randomUUID()}/messages`, body)).status).toBe(403);
  expect(forwarded).toHaveLength(0);
  expect((await call(path, body)).status).toBe(202);
  expect(forwarded[0]?.body).toEqual(input.input);
});

it("binds model and compact commands to the selected chat and exact settings, while scoped stops stay available", async () => {
  await start();
  const input: ConfirmationAction = {
    kind: "command",
    chatId: randomUUID(),
    input: { command: "settings", model: "fixture", effort: "high", serviceTier: "priority" },
  };
  const path = confirmationPath(input);
  expect((await call(path, input.input)).status).toBe(403);
  const { proof } = await prepare(input);
  expect(
    (await call(path, { ...input.input, model: "different", confirmation: proof })).status,
  ).toBe(403);
  expect(
    (await call(`/chats/${randomUUID()}/commands`, { ...input.input, confirmation: proof }))
      .status,
  ).toBe(403);
  expect((await call(path, { command: "compact", confirmation: proof })).status).toBe(403);
  expect((await call(path, { ...input.input, confirmation: proof })).status).toBe(202);
  expect(forwarded[0]?.body).toEqual(input.input);
  const compact: ConfirmationAction = { ...input, input: { command: "compact" } };
  expect(await (await call("/confirmations", compact)).json()).toEqual({ confirmed: true });
  expect((await call(path, compact.input)).status).toBe(202);
  expect((await call(`/chats/${input.chatId}/stop`, { target: "turn" })).status).toBe(202);
  expect((await call(`/chats/${input.chatId}/rpc`, { method: "process/kill" })).status).toBe(
    404,
  );
});

it("expires codes and limits guesses and resends without unlocking the agent", async () => {
  await start();
  const input = action();
  const path = confirmationPath(input);
  let { proof } = await prepare(input);
  expect((await call("/confirmations", input)).status).toBe(429);
  const badCode = proof.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < confirmationPolicy.attempts; i++)
    expect(
      (await call(path, { ...input.input, confirmation: { ...proof, code: badCode } })).status,
    ).toBe(i === confirmationPolicy.attempts - 1 ? 429 : 403);
  expect((await call(path, { ...input.input, confirmation: proof })).status).toBe(429);
  now += confirmationPolicy.cooldown;
  expect((await call("/confirmations", input)).status).toBe(429);
  now += confirmationPolicy.verificationWindow;
  ({ proof } = await prepare(input));
  now += confirmationPolicy.lifetime;
  expect((await call(path, { ...input.input, confirmation: proof })).status).toBe(403);
  expect(forwarded).toHaveLength(0);
});

it("invalidates replaced and cancelled codes, and requires fresh confirmation for replies and account changes", async () => {
  await start();
  const input = action();
  const old = await prepare(input);
  now += confirmationPolicy.cooldown;
  const next = await prepare(input);
  expect(
    (await call(confirmationPath(input), { ...input.input, confirmation: old.proof })).status,
  ).toBe(403);
  await call(`/confirmations/${next.proof.id}/cancel`, {});
  expect(
    (await call(confirmationPath(input), { ...input.input, confirmation: next.proof })).status,
  ).toBe(403);
  now += confirmationPolicy.cooldown;
  for (const protectedAction of [
    { kind: "response", input: { id: "approval-1", result: { decision: "accept" } } },
    { kind: "login", input: {} },
  ] satisfies ConfirmationAction[]) {
    const path = confirmationPath(protectedAction);
    expect((await call(path, protectedAction.input)).status).toBe(403);
    const { proof } = await prepare(protectedAction);
    expect((await call(path, { ...protectedAction.input, confirmation: proof })).status).toBe(
      202,
    );
  }
  expect(forwarded.map((item) => item.path)).toEqual(["/requests/respond", "/login"]);
});

it("keeps the incorrect-code limit across newly issued codes and browser sessions", async () => {
  await start();
  const input = action();
  const path = confirmationPath(input);
  const first = await prepare(input);
  const wrong = (value: string) => (value === "000000" ? "111111" : "000000");
  for (let i = 0; i < 4; i++)
    expect(
      (
        await call(path, {
          ...input.input,
          confirmation: { ...first.proof, code: wrong(first.proof.code) },
        })
      ).status,
    ).toBe(403);
  now += confirmationPolicy.cooldown;
  const next = await prepare(input);
  expect(
    (
      await call(path, {
        ...input.input,
        confirmation: { ...next.proof, code: wrong(next.proof.code) },
      })
    ).status,
  ).toBe(429);
  expect((await call("/confirmations", input, "fresh-session")).status).toBe(429);
  expect(forwarded).toHaveLength(0);
});

it("blocks worker aliases and internal controls instead of exposing an unrestricted relay", async () => {
  await start();
  const input = action();
  for (const path of [
    confirmationPath(input) + "/",
    "/chats/native/messages",
    "/chats/%2e/messages",
    "/requests/respond/",
    "/REQUESTS/respond",
    "/drain",
    "/resume",
    "/run",
  ])
    expect([400, 403, 404]).toContain((await call(path, input.input)).status);
  expect(forwarded).toHaveLength(0);
});

it("fails closed when Telegram is not configured", async () => {
  configured = false;
  await start();
  const input = action();
  expect((await call("/confirmations", input)).status).toBe(503);
  expect(
    (
      await call(confirmationPath(input), {
        ...input.input,
        confirmation: { id: randomUUID(), code: "123456" },
      })
    ).status,
  ).toBe(403);
  expect(forwarded).toHaveLength(0);
});

it.each(["failed", "wrong-topic"])(
  "fails closed when Telegram delivery is %s",
  async (failure) => {
    await start();
    deliveryStatus = failure === "failed" ? 502 : 200;
    wrongTopic = failure === "wrong-topic";
    expect((await call("/confirmations", action())).status).toBe(503);
    expect(forwarded).toHaveLength(0);
  },
);

it("keeps the verified browser unlocked during its native turn and five minutes after completion, chaining new work", async () => {
  await start();
  const input = action();
  const { proof } = await prepare(input);
  activity = { id: randomUUID(), status: "inProgress", completedAt: null };
  expect(
    (await call(confirmationPath(input), { ...input.input, confirmation: proof })).status,
  ).toBe(202);
  now += 2 * 60 * 60_000;
  expect(await (await call("/confirmations", input)).json()).toEqual({ confirmed: true });
  expect((await call(confirmationPath(input), input.input, "another-session")).status).toBe(
    403,
  );
  const reply: ConfirmationAction = {
    kind: "response",
    input: { id: 0, result: { action: "accept" } },
  };
  expect((await call(confirmationPath(reply), reply.input)).status).toBe(202);
  activity.status = "completed";
  activity.completedAt = now / 1000;
  now += 299_000;
  const next = action();
  expect(await (await call("/confirmations", next)).json()).toEqual({ confirmed: true });
  activity = { id: randomUUID(), status: "inProgress", completedAt: null };
  expect((await call(confirmationPath(next), next.input)).status).toBe(202);
  now += 60 * 60_000;
  expect(await (await call("/confirmations", next)).json()).toEqual({ confirmed: true });
  activity.status = "interrupted";
  activity.completedAt = now / 1000;
  now += 300_000;
  expect((await call(confirmationPath(next), next.input)).status).toBe(403);
  expect((await call("/confirmations", next)).status).toBe(201);
  expect(delivered).toHaveLength(2);
});

it("does not extend confirmation from reading, unrelated turns, or a different login session", async () => {
  await start();
  const input = action();
  const { proof } = await prepare(input);
  activity = { id: randomUUID(), status: "completed", completedAt: now / 1000 };
  expect(
    (await call(confirmationPath(input), { ...input.input, confirmation: proof })).status,
  ).toBe(202);
  now += 299_000;
  expect(await (await call("/confirmations", input)).json()).toEqual({ confirmed: true });
  now += 1000;
  activity = { id: randomUUID(), status: "inProgress", completedAt: null };
  expect((await call(confirmationPath(input), input.input)).status).toBe(403);
});
