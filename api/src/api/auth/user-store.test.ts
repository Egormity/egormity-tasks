import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

import { hashPassword, UserStore } from "./user-store.js";

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
