import express from "express";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkConfirmations, workConfirmationGrace } from "./work-confirmations.js";
import { parseInternalTasksEnvironment } from "../config.js";
import type { ConfirmationAction } from "../contracts/confirmation.js";

const owner = { id: "admin", session: "session", name: "Admin", email: null };
const action = (chatId: string = randomUUID()): ConfirmationAction => ({
  kind: "message",
  chatId,
  input: { text: "Work", attachments: [], requestId: randomUUID() },
});
let server: Server;
let grants: WorkConfirmations;
let now: number;
let unavailable: boolean;
let responseChat: string;
let turns: Map<string, { id: string; status: string; completedAt: number | null }[]>;

beforeEach(async () => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  unavailable = false;
  responseChat = randomUUID();
  turns = new Map();
  const app = express();
  app.use((req, res, next) => {
    expect(req.get("authorization")).toBe(`Bearer ${"x".repeat(32)}`);
    if (unavailable) res.sendStatus(503);
    else next();
  });
  app.get("/activity/:id", (req, res) => {
    const values = turns.get(req.params.id) ?? [];
    res.json(
      (req.query.turnId
        ? values.find((turn) => turn.id === req.query.turnId)
        : values.at(-1)) ?? null,
    );
  });
  app.get("/snapshot", (_req, res) =>
    res.json({ requests: [{ id: 0, params: { threadId: responseChat } }] }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Address");
  grants = new WorkConfirmations(
    parseInternalTasksEnvironment({
      OPERATIONS_AGENT_WORKER_URL: `http://127.0.0.1:${address.port}`,
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
    }),
  );
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});
const track = async (chatId: string) => {
  const turn = { id: randomUUID(), status: "inProgress", completedAt: null as number | null };
  turns.set(chatId, [turn]);
  await (
    await grants.begin(owner, action(chatId))
  )(true);
  return turn;
};

it("keeps simultaneous verified tasks active until the last finishes, using native end time even without an open browser", async () => {
  grants.authorize(owner);
  const first = await track(randomUUID());
  const second = await track(randomUUID());
  now += 3_600_000;
  first.status = "completed";
  first.completedAt = now / 1000;
  now += 3_600_000;
  expect(await grants.allowed(owner)).toBe(true);
  second.status = "completed";
  second.completedAt = now / 1000;
  now += workConfirmationGrace - 1;
  expect(await grants.allowed(owner)).toBe(true);
  now += 1;
  expect(await grants.allowed(owner)).toBe(false);
});

it("does not start the five minute grace when an old finished task is first observed", async () => {
  grants.authorize(owner);
  const turn = await track(randomUUID());
  now += 3_600_000;
  turn.status = "completed";
  turn.completedAt = now / 1000;
  now += 3_600_000;
  expect(await grants.allowed(owner)).toBe(false);
});

it("scopes confirmation to the exact browser session and revokes it on logout", async () => {
  grants.authorize(owner);
  await track(randomUUID());
  expect(await grants.allowed({ ...owner, session: "other" })).toBe(false);
  expect(await grants.allowed({ ...owner, id: "other" })).toBe(false);
  grants.revoke(owner.session);
  expect(await grants.allowed(owner)).toBe(false);
});

it("tracks native work when the first confirmed action answers request zero", async () => {
  grants.authorize(owner);
  turns.set(responseChat, [{ id: randomUUID(), status: "inProgress", completedAt: null }]);
  await (
    await grants.begin(owner, {
      kind: "response",
      input: { id: 0, result: { action: "accept" } },
    })
  )(true);
  now += 3_600_000;
  expect(await grants.allowed(owner)).toBe(true);
});

it("does not silently trust an unavailable worker or extend failed submissions", async () => {
  grants.authorize(owner);
  await track(randomUUID());
  now += workConfirmationGrace;
  unavailable = true;
  await expect(grants.allowed(owner)).rejects.toMatchObject({ status: 503 });
  unavailable = false;
  expect(await grants.allowed(owner)).toBe(true);
  grants.authorize(owner);
  const finish = await grants.begin(owner, action());
  now += workConfirmationGrace;
  expect(await grants.allowed(owner)).toBe(true);
  await finish(false);
  expect(await grants.allowed(owner)).toBe(false);
});
