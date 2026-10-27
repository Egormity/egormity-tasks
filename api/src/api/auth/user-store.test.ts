import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

import { hashPassword, UserStore } from "./user-store.js";

const createStore = () => {
  const db = new DatabaseSync(":memory:");
  const store = new UserStore(
    db,
    { id: "00000000-0000-5000-8000-000000000001", username: "admin", role: "admin" },
    hashPassword("bootstrap-password"),
  );
  return { db, store };
};

it("adds username to legacy account tables without losing sign-in details", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE app_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
      passwordHash TEXT NOT NULL,
      sessionVersion INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const passwordHash = hashPassword("existing-account-password");
  db.prepare(
    "INSERT INTO app_users (id, name, email, role, passwordHash) VALUES (?, ?, ?, ?, ?)",
  ).run(
    "11111111-1111-4111-8111-111111111111",
    "Existing account",
    "old@example.test",
    "manager",
    passwordHash,
  );

  const store = new UserStore(
    db,
    { id: "00000000-0000-5000-8000-000000000001", username: "admin", role: "admin" },
    hashPassword("bootstrap-password"),
  );

  expect(store.findByUsername("old@example.test")).toMatchObject({
    id: "11111111-1111-4111-8111-111111111111",
    username: "old@example.test",
    role: "manager",
    passwordHash,
  });
  expect(store.list().map(({ username }) => username)).toEqual(["admin", "old@example.test"]);
  expect(store.list()[0]).not.toHaveProperty("passwordHash");
  db.close();
});

it("removes an account and reports it as missing afterwards", () => {
  const { db, store } = createStore();
  const manager = store.create({
    username: "manager",
    role: "manager",
    password: "manager-password",
  });

  expect(store.remove(manager.id, "00000000-0000-5000-8000-000000000001")).toEqual(manager);
  expect(store.findById(manager.id)).toBeNull();
  expect(store.list().map(({ username }) => username)).toEqual(["admin"]);
  db.close();
});

it("refuses to remove the signed-in account, the last admin, or an unknown account", () => {
  const { db, store } = createStore();
  const adminId = "00000000-0000-5000-8000-000000000001";
  const manager = store.create({
    username: "manager",
    role: "manager",
    password: "manager-password",
  });

  expect(() => store.remove(adminId, adminId)).toThrowError(
    "You cannot delete your own account.",
  );
  expect(() => store.remove(adminId, manager.id)).toThrowError(
    "At least one admin account must remain.",
  );
  expect(() => store.remove("11111111-1111-4111-8111-111111111111", adminId)).toThrowError(
    "User not found.",
  );
  expect(store.list()).toHaveLength(2);
  db.close();
});
