import express from "express";
import type { Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { parseInternalTasksEnvironment } from "../config.js";
import { createApplication } from "../app.js";
import { BoardDatabase } from "../board/database.js";
import { localAdminCookieToken, localAuthTestEnvironment } from "../auth/test-support.js";

const servers: Server[] = [];
const listen = async (app: express.Express) => {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Address");
  return `http://127.0.0.1:${address.port}`;
};
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("relays binary uploads and native SSE through administrator auth without storing chat data", async () => {
  const gateway = express();
  let credential: string | undefined;
  gateway.post(
    "/chats/native/files",
    express.raw({ type: "application/octet-stream" }),
    (req, res) => {
      credential = req.headers.authorization;
      res.type("application/octet-stream").send(req.body);
    },
  );
  gateway.get("/events", (_req, res) => {
    credential = _req.headers.authorization;
    res.type("text/event-stream");
    res.write('data: {"method":"item/agentMessage/delta","params":{"delta":"hello"}}\n\n');
    res.end();
  });
  const db = new BoardDatabase(":memory:");
  const config = parseInternalTasksEnvironment({
    ...localAuthTestEnvironment,
    OPERATIONS_AGENT_PUBLIC_URL: "https://tasks.example.test",
    OPERATIONS_AGENT_WORKER_URL: await listen(gateway),
    OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
  });
  const token = localAdminCookieToken(config);
  const app = createApplication(config, db);
  const base = await listen(app.app);
  try {
    expect((await fetch(base + "/api/events")).status).toBe(401);
    const bytes = Buffer.from([0, 255, 9, 80, 10]);
    const response = await fetch(base + "/api/chats/native/files", {
      method: "POST",
      headers: {
        Cookie: `amazi_operations_session=${token}`,
        Origin: "https://tasks.example.test",
        "Content-Type": "application/octet-stream",
        "X-File-Name": "example.bin",
      },
      body: bytes,
    });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    const stream = await fetch(base + "/api/events", {
      headers: { Cookie: `amazi_operations_session=${token}` },
    });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    expect(await stream.text()).toContain("item/agentMessage/delta");
    expect(credential).toBe(`Bearer ${"x".repeat(32)}`);
    expect(
      db.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('chats', 'messages', 'activity')",
        )
        .all(),
    ).toEqual([]);
  } finally {
    await app.close();
    db.close();
  }
});
