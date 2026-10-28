import { parseInternalTasksEnvironment, internalTasksPolicy as policy } from "./config.js";
import express from "express";

import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { BoardSnapshot, Task, TaskTag } from "./contracts/board.js";

import { createApplication } from "./app.js";
import { createTestDatabase } from "./test-support/database.js";
import type { PostgresDatabase } from "./database/database.js";
import {
  localAdminCookieToken,
  localAuthTestEnvironment,
  testAdminPassword,
} from "./auth/test-support.js";

let servers: Server[];

let application: Awaited<ReturnType<typeof createApplication>>;

let store: PostgresDatabase;

let base: string;

let token: string;

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
  sessionToken = token,
) =>
  fetch(`${base}${policy.apiPath}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(authenticated ? { Cookie: `${policy.cookieName}=${sessionToken}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(async () => {
  servers = [];
  store = createTestDatabase();
  const config = parseInternalTasksEnvironment({
    ...localAuthTestEnvironment,
    OPERATIONS_AGENT_PUBLIC_URL: "https://operations.example.test/",
  });
  token = localAdminCookieToken(config);
  application = await createApplication(config, store);
  base = await listen(application.app);
});

afterEach(async () => {
  await application?.close();
  await store.close();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("protects board data and accepts the configured local administrator", async () => {
  expect((await call("/board", undefined, false)).status).toBe(401);
  expect((await call("/board")).status).toBe(200);
  expect(
    (await call("/login", { username: "admin@example", password: "wrong-password" }, false))
      .status,
  ).toBe(401);
  const login = await call(
    "/login",
    { username: "admin@example", password: testAdminPassword },
    false,
  );
  expect(login.status).toBe(200);
  expect(await login.json()).toMatchObject({
    username: "admin@example",
    role: "admin",
  });
});

it("creates and edits users, applies roles to sign-in, and restricts user management to admins", async () => {
  const initialUsers = await call("/users");
  expect(initialUsers.status).toBe(200);
  const listedUsers = (await initialUsers.json()) as Array<{ id: string; username: string }>;
  expect(listedUsers).toMatchObject([{ username: "admin@example", role: "admin" }]);
  const selfRoleChange = await call(`/users/${listedUsers[0]!.id}`, {
    username: "admin@example",
    role: "manager",
  });
  expect(selfRoleChange.status).toBe(409);

  const createdResponse = await call("/users", {
    username: "Team Manager",
    role: "manager",
    password: "manager-password-86f92e",
  });
  expect(createdResponse.status).toBe(201);
  const created = (await createdResponse.json()) as {
    id: string;
    username: string;
    role: string;
    password?: string;
  };
  expect(created).toMatchObject({
    username: "Team Manager",
    role: "manager",
  });
  expect(created.password).toBeUndefined();

  const managerLogin = await call(
    "/login",
    { username: created.username, password: "manager-password-86f92e" },
    false,
  );
  expect(managerLogin.status).toBe(200);
  const managerToken = managerLogin.headers
    .get("set-cookie")!
    .split(";")[0]!
    .slice(policy.cookieName.length + 1);
  expect((await call("/session", undefined, true, undefined, managerToken)).status).toBe(200);
  expect((await call("/users", undefined, true, undefined, managerToken)).status).toBe(403);
  expect(
    (await call(`/users/${created.id}/remove`, {}, true, undefined, managerToken)).status,
  ).toBe(403);
  expect((await call("/board", undefined, true, undefined, managerToken)).status).toBe(200);

  const adminRoleChange = await call(`/users/${created.id}`, {
    username: "Team Admin",
    role: "admin",
    password: "updated-manager-password-45c7a2",
  });
  expect(adminRoleChange.status).toBe(200);
  expect((await call("/session", undefined, true, undefined, managerToken)).status).toBe(401);
  expect(
    (
      await call(
        "/login",
        { username: created.username, password: "manager-password-86f92e" },
        false,
      )
    ).status,
  ).toBe(401);
  const updatedLogin = await call(
    "/login",
    { username: "Team Admin", password: "updated-manager-password-45c7a2" },
    false,
  );
  expect(updatedLogin.status).toBe(200);
  expect(await updatedLogin.json()).toMatchObject({ username: "Team Admin", role: "admin" });

  const selfDelete = await call(`/users/${listedUsers[0]!.id}/remove`, {});
  expect(selfDelete.status).toBe(409);

  const removedResponse = await call(`/users/${created.id}/remove`, {});
  expect(removedResponse.status).toBe(200);
  expect(await removedResponse.json()).toMatchObject({
    id: created.id,
    username: "Team Admin",
  });
  const remainingUsers = (await (await call("/users")).json()) as Array<{ username: string }>;
  expect(remainingUsers.map(({ username }) => username)).toEqual(["admin@example"]);
});

it("uses an HttpOnly secure cookie and rejects cross-origin mutations", async () => {
  const response = await call(
    "/login",
    { username: "admin@example", password: testAdminPassword },
    false,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
  expect(await response.text()).not.toContain(token);
  expect((await call("/board", {}, true, "https://attacker.example.test")).status).toBe(403);
});

it("protects the board, preserves ordering and rejects stale edits", async () => {
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
  expect(second).toMatchObject({ status: "queue", order: 0 });
  const creationSnapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(creationSnapshot.cards.map(({ id, order }) => ({ id, order }))).toEqual([
    { id: second.id, order: 0 },
    { id: first.id, order: 1 },
  ]);
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
  expect(Object.keys(snapshot).sort()).toEqual([
    "cards",
    "columns",
    "dividers",
    "tags",
    "version",
  ]);
  const current = snapshot.cards.find((card) => card.id === first.id)!;
  // Historical task metadata must not leak through the maintained board contract.
  await store.query("UPDATE task_cards SET data = $1 WHERE id = $2", [
    JSON.stringify({ ...current, agentVerdict: "Legacy metadata" }),
    current.id,
  ]);
  const cleanSnapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(cleanSnapshot.cards.find((card) => card.id === first.id)).not.toHaveProperty(
    "agentVerdict",
  );
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
  snapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(snapshot.cards.find((card) => card.id === first.id)).toMatchObject({
    archivedAt: null,
    status: "done",
    tagIds: [tag.id],
  });
  expect((await call("/board")).status).toBe(200);
  expect((await call("/board/cards", input, false)).status).toBe(401);
});

it("creates, edits, orders and safely removes persisted columns and dividers", async () => {
  const initial = (await (await call("/board")).json()) as BoardSnapshot;
  const baseColumns = initial.columns!;
  expect((await call("/board/tags", { name: "Custom color", tone: "#3478ab" })).status).toBe(
    201,
  );
  expect(
    (await call("/board/tags", { name: "Invalid color", tone: "rgb(1,2,3)" })).status,
  ).toBe(400);
  const createdResponse = await call("/board/columns", {
    label: "Custom review",
    accent: "#123456",
  });
  expect(createdResponse.status).toBe(201);
  const created = (await createdResponse.json()) as NonNullable<
    BoardSnapshot["columns"]
  >[number];
  expect(
    (await call("/board/columns", { label: "Bad color", accent: "url(javascript:1)" })).status,
  ).toBe(400);

  const updatedResponse = await call(`/board/columns/${created.id}`, {
    label: "Custom check",
    accent: "var(--color-board-review)",
  });
  expect(await updatedResponse.json()).toMatchObject({ id: created.id, label: "Custom check" });

  const ids = [created.id, ...baseColumns.map(({ id }) => id)];
  expect((await call("/board/columns/order", { ids })).status).toBe(200);
  const card = (await (
    await call("/board/cards", {
      title: "Custom column task",
      description: null,
      status: created.id,
      priority: "medium",
      tagIds: [],
    })
  ).json()) as Task;
  expect(card.status).toBe(created.id);
  expect((await call(`/board/columns/${created.id}/remove`, {})).status).toBe(409);

  const archived = (await (
    await call(`/board/cards/${card.id}`, { revision: card.revision, archived: true })
  ).json()) as Task;
  expect((await call(`/board/columns/${created.id}/remove`, {})).status).toBe(409);
  const moved = await call(`/board/cards/${card.id}`, {
    revision: archived.revision,
    archived: false,
    status: "backlog",
  });
  expect(moved.status).toBe(200);
  expect((await call(`/board/columns/${created.id}/remove`, {})).status).toBe(200);

  const divider = (await (
    await call("/board/dividers", { title: "First release", columnId: "backlog" })
  ).json()) as NonNullable<BoardSnapshot["dividers"]>[number];
  expect(divider).toMatchObject({ title: "First release", columnId: "backlog" });
  expect(((await (await call("/board")).json()) as BoardSnapshot).dividers).toContainEqual(
    divider,
  );

  const secondCard = (await (
    await call("/board/cards", {
      title: "Task before section",
      description: null,
      status: "backlog",
      priority: "medium",
      tagIds: [],
    })
  ).json()) as Task;
  const movedCard = (await (
    await call(`/board/cards/${secondCard.id}`, {
      revision: secondCard.revision,
      beforeId: divider.id,
    })
  ).json()) as Task;
  expect(movedCard.order).toBeGreaterThan(card.order);
  expect(movedCard.order).toBeLessThan(
    ((await (await call("/board")).json()) as BoardSnapshot).dividers!.find(
      ({ id }) => id === divider.id,
    )!.order,
  );

  const destinationCard = (await (
    await call("/board/cards", {
      title: "Task in destination column",
      description: null,
      status: "queue",
      priority: "medium",
      tagIds: [],
    })
  ).json()) as Task;
  const movedDividerResponse = await call(`/board/dividers/${divider.id}/move`, {
    columnId: "queue",
    beforeId: destinationCard.id,
  });
  expect(movedDividerResponse.status).toBe(200);
  expect(await movedDividerResponse.json()).toMatchObject({
    id: divider.id,
    columnId: "queue",
    title: "First release",
  });
  const movedDividerSnapshot = (await (await call("/board")).json()) as BoardSnapshot;
  const movedDivider = movedDividerSnapshot.dividers!.find(({ id }) => id === divider.id)!;
  const movedDestinationCard = movedDividerSnapshot.cards.find(
    ({ id }) => id === destinationCard.id,
  )!;
  expect(movedDivider.order).toBeLessThan(movedDestinationCard.order);
  expect(
    (
      await call(`/board/dividers/${divider.id}/move`, {
        columnId: "missing-column",
        beforeId: null,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await call(`/board/dividers/${divider.id}/move`, {
        columnId: "queue",
        beforeId: "missing-item",
      })
    ).status,
  ).toBe(409);

  const reorderedDividerResponse = await call(`/board/dividers/${divider.id}/move`, {
    columnId: "queue",
    beforeId: null,
  });
  expect(reorderedDividerResponse.status).toBe(200);
  const reorderedDivider = (await reorderedDividerResponse.json()) as NonNullable<
    BoardSnapshot["dividers"]
  >[number];
  const reorderedSnapshot = (await (await call("/board")).json()) as BoardSnapshot;
  const reorderedDestinationCard = reorderedSnapshot.cards.find(
    ({ id }) => id === destinationCard.id,
  )!;
  expect(reorderedDivider.order).toBeGreaterThan(reorderedDestinationCard.order);

  const renamed = await call(`/board/dividers/${divider.id}`, { title: "Ready for release" });
  expect(await renamed.json()).toMatchObject({ id: divider.id, title: "Ready for release" });
  expect(await (await call(`/board/dividers/${divider.id}/remove`, {})).json()).toEqual({
    id: divider.id,
  });
  const finalSnapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(finalSnapshot.columns?.map(({ id }) => id)).toEqual(baseColumns.map(({ id }) => id));
  expect(finalSnapshot.dividers).toEqual([]);
});

it("reads legacy dividers and gives them a safe default title and placement", async () => {
  await store.query("UPDATE board_settings SET data = $1 WHERE key = 'dividers'", [
    JSON.stringify([{ id: "legacy-divider" }]),
  ]);
  const snapshot = (await (await call("/board")).json()) as BoardSnapshot;
  expect(snapshot.dividers).toEqual([
    { id: "legacy-divider", title: "Раздел 1", columnId: "backlog", order: 0 },
  ]);
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
