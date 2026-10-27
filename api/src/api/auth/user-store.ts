import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { User } from "../contracts/auth.js";
import { HttpError } from "../http-error.js";

export type UserCredentials = User & {
  passwordHash: string;
  sessionVersion: number;
};

type UserRow = {
  id: string;
  username: string;
  role: "admin" | "manager";
  passwordHash: string;
  sessionVersion: number;
};

export const hashPassword = (password: string) => {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("base64url")}.${hash.toString("base64url")}`;
};

export const verifyPassword = (password: string, passwordHash: string) => {
  const [saltValue, hashValue, extra] = passwordHash.split(".");
  if (!saltValue || !hashValue || extra !== undefined) return false;
  const salt = Buffer.from(saltValue, "base64url");
  const expected = Buffer.from(hashValue, "base64url");
  if (salt.length < 16 || expected.length !== 64) return false;
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
};

export class UserStore {
  constructor(
    private readonly db: DatabaseSync,
    bootstrapAdmin: User,
    bootstrapPasswordHash: string,
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
        passwordHash TEXT NOT NULL,
        sessionVersion INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const userColumns = db.prepare("PRAGMA table_info(app_users)").all() as Array<{
      name: string;
    }>;
    if (!userColumns.some((column) => column.name === "username")) {
      db.exec("ALTER TABLE app_users ADD COLUMN username TEXT");
      db.exec("UPDATE app_users SET username = email WHERE username IS NULL");
    }
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_unique ON app_users(username COLLATE NOCASE)",
    );
    db.prepare(
      "INSERT OR IGNORE INTO app_users (id, name, email, role, passwordHash, sessionVersion, username) VALUES (?, ?, ?, ?, ?, 0, ?)",
    ).run(
      bootstrapAdmin.id,
      bootstrapAdmin.username,
      bootstrapAdmin.username,
      bootstrapAdmin.role,
      bootstrapPasswordHash,
      bootstrapAdmin.username,
    );
  }

  findById = (id: string): UserCredentials | null => {
    const row = this.db
      .prepare(
        "SELECT id, username, role, passwordHash, sessionVersion FROM app_users WHERE id = ?",
      )
      .get(id) as UserRow | undefined;
    return row ?? null;
  };

  findByUsername = (username: string): UserCredentials | null => {
    const row = this.db
      .prepare(
        "SELECT id, username, role, passwordHash, sessionVersion FROM app_users WHERE username = ? COLLATE NOCASE",
      )
      .get(username.trim()) as UserRow | undefined;
    return row ?? null;
  };

  list = (): User[] =>
    this.db
      .prepare("SELECT id, username, role FROM app_users ORDER BY username COLLATE NOCASE")
      .all() as User[];

  create = (input: { username: string; role: User["role"]; password: string }): User => {
    const user: User = {
      id: randomUUID(),
      username: input.username,
      role: input.role,
    };
    try {
      this.db
        .prepare(
          "INSERT INTO app_users (id, name, email, role, passwordHash, sessionVersion, username) VALUES (?, ?, ?, ?, ?, 0, ?)",
        )
        .run(
          user.id,
          user.username,
          user.username,
          user.role,
          hashPassword(input.password),
          user.username,
        );
    } catch (error) {
      if (isUsernameConflict(error))
        throw new HttpError(409, "A user with this username already exists.");
      throw error;
    }
    return user;
  };

  update = (
    id: string,
    actorId: string,
    input: {
      username: string;
      role: User["role"];
      password?: string | undefined;
    },
  ): User => {
    const current = this.findById(id);
    if (!current) throw new HttpError(404, "User not found.");
    if (actorId === id && input.role !== current.role)
      throw new HttpError(409, "You cannot change your own role.");
    if (current.role === "admin" && input.role === "manager") {
      const admins = this.db
        .prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin'")
        .get() as { count: number };
      if (admins.count <= 1)
        throw new HttpError(409, "At least one admin account must remain.");
    }
    const user: User = { id, username: input.username, role: input.role };
    try {
      this.db
        .prepare(
          `UPDATE app_users
           SET name = ?, email = ?, username = ?, role = ?,
               passwordHash = COALESCE(?, passwordHash),
               sessionVersion = sessionVersion + ?,
               updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .run(
          user.username,
          user.username,
          user.username,
          user.role,
          input.password ? hashPassword(input.password) : null,
          input.password || input.role !== current.role ? 1 : 0,
          id,
        );
    } catch (error) {
      if (isUsernameConflict(error))
        throw new HttpError(409, "A user with this username already exists.");
      throw error;
    }
    return user;
  };

  remove = (id: string, actorId: string): User => {
    const current = this.findById(id);
    if (!current) throw new HttpError(404, "User not found.");
    if (actorId === id) throw new HttpError(409, "You cannot delete your own account.");
    if (current.role === "admin") {
      const admins = this.db
        .prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin'")
        .get() as { count: number };
      if (admins.count <= 1)
        throw new HttpError(409, "At least one admin account must remain.");
    }
    this.db.prepare("DELETE FROM app_users WHERE id = ?").run(id);
    return { id: current.id, username: current.username, role: current.role };
  };
}

const isUsernameConflict = (error: unknown) =>
  error instanceof Error && error.message.includes("app_users.username");
