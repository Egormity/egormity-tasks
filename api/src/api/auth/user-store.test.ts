import { expect, it } from "vitest";

import { createTestDatabase } from "../test-support/database.js";
import { hashPassword, UserStore } from "./user-store.js";

const admin = {
  id: "00000000-0000-5000-8000-000000000001",
  username: "admin",
  role: "admin" as const,
};

const createStore = async () => {
  const db = createTestDatabase();
  await db.migrate();
  const store = new UserStore(db);
  await store.ensureBootstrapAdmin(admin, hashPassword("bootstrap-password"), "Admin");
  return { db, store };
};

it("preserves existing sign-in details and exposes only public account fields", async () => {
  const { db, store } = await createStore();
  const passwordHash = hashPassword("existing-account-password");
  await db.query(
    `INSERT INTO app_users
      (id, name, email, role, password_hash, session_version, username)
     VALUES ($1, $2, $3, $4, $5, 0, $3)`,
    [
      "11111111-1111-4111-8111-111111111111",
      "Existing account",
      "old@example.test",
      "manager",
      passwordHash,
    ],
  );

  expect(await store.findByUsername("OLD@example.test")).toMatchObject({
    id: "11111111-1111-4111-8111-111111111111",
    username: "old@example.test",
    role: "manager",
    passwordHash,
  });
  const users = await store.list();
  expect(users.map(({ username }) => username)).toEqual(["admin", "old@example.test"]);
  expect(users[0]).not.toHaveProperty("passwordHash");
  await db.close();
});

it("removes an account and reports it as missing afterwards", async () => {
  const { db, store } = await createStore();
  const manager = await store.create({
    username: "manager",
    role: "manager",
    password: "manager-password",
  });

  expect(await store.remove(manager.id, admin.id)).toEqual(manager);
  expect(await store.findById(manager.id)).toBeNull();
  expect((await store.list()).map(({ username }) => username)).toEqual(["admin"]);
  await db.close();
});

it("refuses to remove the signed-in account, the last admin, or an unknown account", async () => {
  const { db, store } = await createStore();
  const manager = await store.create({
    username: "manager",
    role: "manager",
    password: "manager-password",
  });

  await expect(store.remove(admin.id, admin.id)).rejects.toThrow(
    "You cannot delete your own account.",
  );
  await expect(store.remove(admin.id, manager.id)).rejects.toThrow(
    "At least one admin account must remain.",
  );
  await expect(store.remove("11111111-1111-4111-8111-111111111111", admin.id)).rejects.toThrow(
    "User not found.",
  );
  expect(await store.list()).toHaveLength(2);
  await db.close();
});
