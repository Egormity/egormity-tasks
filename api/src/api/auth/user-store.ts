import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import type { User } from "../contracts/auth.js";
import type { QueryExecutor } from "../database/database.js";
import { PostgresDatabase } from "../database/database.js";
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

const userColumns = `id, username, role, password_hash AS "passwordHash",
  session_version AS "sessionVersion"`;

export class UserStore {
  constructor(private readonly db: PostgresDatabase) {}

  ensureBootstrapAdmin = async (user: User, passwordHash: string, displayName: string) => {
    await this.db.query(
      `INSERT INTO app_users
        (id, name, email, role, password_hash, session_version, username)
       VALUES ($1, $2, $3, $4, $5, 0, $3)
       ON CONFLICT (id) DO NOTHING`,
      [user.id, displayName, user.username, user.role, passwordHash],
    );
  };

  findById = async (id: string, executor: QueryExecutor = this.db) => {
    const rows = await executor.query<UserRow>(
      `SELECT ${userColumns} FROM app_users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  };

  findByUsername = async (username: string) => {
    const rows = await this.db.query<UserRow>(
      `SELECT ${userColumns} FROM app_users WHERE lower(username) = lower($1)`,
      [username.trim()],
    );
    return rows[0] ?? null;
  };

  list = async (): Promise<User[]> =>
    this.db.query<User>("SELECT id, username, role FROM app_users ORDER BY lower(username)");

  create = async (input: { username: string; role: User["role"]; password: string }) => {
    const user: User = {
      id: randomUUID(),
      username: input.username,
      role: input.role,
    };
    try {
      await this.db.query(
        `INSERT INTO app_users
          (id, name, email, role, password_hash, session_version, username)
         VALUES ($1, $2, $2, $3, $4, 0, $2)`,
        [user.id, user.username, user.role, hashPassword(input.password)],
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new HttpError(409, "A user with this username already exists.");
      throw error;
    }
    return user;
  };

  update = async (
    id: string,
    actorId: string,
    input: {
      username: string;
      role: User["role"];
      password?: string | undefined;
    },
  ) => {
    const current = await this.findById(id);
    if (!current) throw new HttpError(404, "User not found.");
    if (actorId === id && input.role !== current.role)
      throw new HttpError(409, "You cannot change your own role.");

    const user: User = { id, username: input.username, role: input.role };
    try {
      await this.db.transaction(async (executor) => {
        if (current.role === "admin" && input.role === "manager") {
          const admins = await executor.query<{ id: string }>(
            "SELECT id FROM app_users WHERE role = 'admin' FOR UPDATE",
          );
          if (admins.length <= 1)
            throw new HttpError(409, "At least one admin account must remain.");
        }
        await executor.query(
          `UPDATE app_users
           SET name = $1, email = $1, username = $1, role = $2,
               password_hash = COALESCE($3, password_hash),
               session_version = session_version + $4,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $5`,
          [
            user.username,
            user.role,
            input.password ? hashPassword(input.password) : null,
            input.password || input.role !== current.role ? 1 : 0,
            id,
          ],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new HttpError(409, "A user with this username already exists.");
      throw error;
    }
    return user;
  };

  remove = async (id: string, actorId: string) =>
    this.db.transaction(async (executor) => {
      const current = await this.findById(id, executor);
      if (!current) throw new HttpError(404, "User not found.");
      if (actorId === id) throw new HttpError(409, "You cannot delete your own account.");
      if (current.role === "admin") {
        const admins = await executor.query<{ id: string }>(
          "SELECT id FROM app_users WHERE role = 'admin' FOR UPDATE",
        );
        if (admins.length <= 1)
          throw new HttpError(409, "At least one admin account must remain.");
      }
      await executor.query("DELETE FROM app_users WHERE id = $1", [id]);
      return { id: current.id, username: current.username, role: current.role };
    });
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";
