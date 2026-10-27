import type { Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { createApplication } from "../app.js";
import { BoardDatabase } from "../board/database.js";
import { parseInternalTasksEnvironment } from "../config.js";
import { internalTasksPolicy } from "../contracts/policy.js";
import { localAuthTestEnvironment, testAdminPassword } from "./test-support.js";

let server: Server | undefined;
let application: ReturnType<typeof createApplication> | undefined;
let store: BoardDatabase | undefined;

afterEach(async () => {
  await application?.close();
  store?.close();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

it("runs local admin and board routes, and revokes logout", async () => {
  const config = parseInternalTasksEnvironment({
    ...localAuthTestEnvironment,
    OPERATIONS_AGENT_PUBLIC_URL: "https://tasks.example.test",
  });
  store = new BoardDatabase(":memory:");
  application = createApplication(config, store);
  server = application.app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Invalid test address");
  const base = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${base}${internalTasksPolicy.apiPath}/login`, {
    method: "POST",
    headers: {
      Origin: "https://tasks.example.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: "admin@example", password: testAdminPassword }),
  });
  expect(login.status).toBe(200);
  expect(await login.json()).toMatchObject({ email: "admin@example", name: "Admin" });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toContain(`${internalTasksPolicy.cookieName}=`);
  expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  expect(login.headers.get("set-cookie")).toContain("Secure");

  const headers = { Cookie: cookie! };
  expect(
    (await fetch(`${base}${internalTasksPolicy.apiPath}/session`, { headers })).status,
  ).toBe(200);
  expect((await fetch(`${base}${internalTasksPolicy.apiPath}/board`, { headers })).status).toBe(
    200,
  );
  for (const path of [
    "/status",
    "/snapshot",
    "/chats",
    "/events",
    "/board/cards/example/chats",
    "/chats/example/task",
    "/chats/example/messages",
    "/codex/login",
    "/confirmations",
    "/confirmations/example/cancel",
    "/requests/respond",
    "/agent/tasks/example/verdict",
  ]) {
    const response = await fetch(`${base}${internalTasksPolicy.apiPath}${path}`, { headers });
    expect(response.status, path).toBe(404);
    expect(await response.json()).toEqual({ error: "Endpoint not found." });
    const mutation = await fetch(`${base}${internalTasksPolicy.apiPath}${path}`, {
      method: "POST",
      headers: { ...headers, Origin: "https://tasks.example.test" },
    });
    expect(mutation.status, path).toBe(404);
  }

  const logout = await fetch(`${base}${internalTasksPolicy.apiPath}/logout`, {
    method: "POST",
    headers: { ...headers, Origin: "https://tasks.example.test" },
  });
  expect(logout.status).toBe(204);
  expect(
    (await fetch(`${base}${internalTasksPolicy.apiPath}/session`, { headers })).status,
  ).toBe(401);
});
