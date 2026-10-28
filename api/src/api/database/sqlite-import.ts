import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type { QueryExecutor } from "./database.js";
import { PostgresDatabase } from "./database.js";

type SqliteRow = Record<string, string | number | bigint | Uint8Array | null>;

type ImportSummary = {
  sourceKey: string;
  alreadyImported: boolean;
  tables: Record<string, number>;
};

const tableNames = [
  "app_users",
  "board_settings",
  "task_cards",
  "task_tags",
  "task_events",
  "task_comments",
  "task_files",
  "task_imports",
  "task_chat_links",
] as const;

const sqliteColumns = (database: DatabaseSync, table: string) =>
  new Set(
    (database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(
      ({ name }) => name,
    ),
  );

const readRows = (database: DatabaseSync, statement: string) =>
  database.prepare(statement).all() as SqliteRow[];

const hashFile = async (path: string) => {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream as AsyncIterable<Buffer>) hash.update(chunk);
  return hash.digest("hex");
};

const ensureEmpty = async (executor: QueryExecutor) => {
  for (const table of tableNames) {
    const rows = await executor.query<{ present: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${table} LIMIT 1) AS present`,
    );
    if (rows[0]?.present)
      throw new Error(`PostgreSQL table ${table} is not empty; refusing to merge SQLite data.`);
  }
};

const insertRows = async (
  executor: QueryExecutor,
  statement: string,
  rows: SqliteRow[],
  values: (row: SqliteRow) => unknown[],
) => {
  for (const row of rows) await executor.query(statement, values(row));
};

export const importSqliteDatabase = async (
  postgres: PostgresDatabase,
  filePath: string,
  sourceKey: string,
): Promise<ImportSummary> => {
  if (!sourceKey.trim()) throw new Error("A source key is required for a SQLite import.");
  await postgres.migrate();
  const database = new DatabaseSync(filePath, { readOnly: true });
  try {
    const integrity = database.prepare("PRAGMA integrity_check").get() as {
      integrity_check: string;
    };
    if (integrity.integrity_check !== "ok") throw new Error("SQLite integrity check failed.");
    if (database.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("SQLite foreign key check failed.");

    const existingTables = new Set(
      (
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as Array<{ name: string }>
      ).map(({ name }) => name),
    );
    for (const table of tableNames) {
      if (!existingTables.has(table))
        throw new Error(`SQLite source is missing required table ${table}.`);
    }

    const sourceHash = await hashFile(filePath);
    const rows = {
      app_users: readRows(database, "SELECT * FROM app_users ORDER BY id"),
      board_settings: readRows(database, "SELECT key, data FROM board_settings ORDER BY key"),
      task_cards: readRows(database, "SELECT id, data FROM task_cards ORDER BY id"),
      task_tags: readRows(database, "SELECT id, name, data FROM task_tags ORDER BY id"),
      task_events: readRows(
        database,
        "SELECT rowid AS source_sequence, id, cardId, data FROM task_events ORDER BY rowid",
      ),
      task_comments: readRows(
        database,
        "SELECT rowid AS source_sequence, id, cardId, data FROM task_comments ORDER BY rowid",
      ),
      task_files: readRows(database, "SELECT sha256, bytes FROM task_files ORDER BY sha256"),
      task_imports: readRows(
        database,
        "SELECT source, digest, data FROM task_imports ORDER BY source",
      ),
      task_chat_links: readRows(
        database,
        "SELECT taskId, chatId, createdAt FROM task_chat_links ORDER BY taskId",
      ),
    };
    const userColumns = sqliteColumns(database, "app_users");
    const tables = Object.fromEntries(
      Object.entries(rows).map(([name, tableRows]) => [name, tableRows.length]),
    );
    const summary: ImportSummary = { sourceKey, alreadyImported: false, tables };

    return await postgres.transaction(async (executor) => {
      const previous = await executor.query<{ source_sha256: string; summary: string }>(
        "SELECT source_sha256, summary FROM sqlite_imports WHERE source_key = $1",
        [sourceKey],
      );
      if (previous.length) {
        if (previous[0]!.source_sha256 !== sourceHash)
          throw new Error("This SQLite source key was already used for different content.");
        return {
          ...(JSON.parse(previous[0]!.summary) as ImportSummary),
          alreadyImported: true,
        };
      }
      await ensureEmpty(executor);

      await insertRows(
        executor,
        `INSERT INTO app_users
          (id, name, email, role, password_hash, session_version, updated_at, username)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        rows.app_users,
        (row) => [
          row.id,
          row.name,
          row.email,
          row.role,
          row.passwordHash,
          row.sessionVersion ?? 0,
          row.updatedAt ?? new Date(0).toISOString(),
          userColumns.has("username") ? (row.username ?? row.email) : row.email,
        ],
      );
      await insertRows(
        executor,
        "INSERT INTO board_settings (key, data) VALUES ($1, $2)",
        rows.board_settings,
        (row) => [row.key, row.data],
      );
      await insertRows(
        executor,
        "INSERT INTO task_cards (id, data) VALUES ($1, $2)",
        rows.task_cards,
        (row) => [row.id, row.data],
      );
      await insertRows(
        executor,
        "INSERT INTO task_tags (id, name, data) VALUES ($1, $2, $3)",
        rows.task_tags,
        (row) => [row.id, row.name, row.data],
      );
      await insertRows(
        executor,
        `INSERT INTO task_events (id, card_id, data, sequence)
         VALUES ($1, $2, $3, $4)`,
        rows.task_events,
        (row) => [row.id, row.cardId, row.data, row.source_sequence],
      );
      await insertRows(
        executor,
        `INSERT INTO task_comments (id, card_id, data, sequence)
         VALUES ($1, $2, $3, $4)`,
        rows.task_comments,
        (row) => [row.id, row.cardId, row.data, row.source_sequence],
      );
      await insertRows(
        executor,
        "INSERT INTO task_files (sha256, bytes) VALUES ($1, decode($2, 'hex'))",
        rows.task_files,
        (row) => [row.sha256, Buffer.from(row.bytes as Uint8Array).toString("hex")],
      );
      await insertRows(
        executor,
        "INSERT INTO task_imports (source, digest, data) VALUES ($1, $2, $3)",
        rows.task_imports,
        (row) => [row.source, row.digest, row.data],
      );
      await insertRows(
        executor,
        "INSERT INTO task_chat_links (task_id, chat_id, created_at) VALUES ($1, $2, $3)",
        rows.task_chat_links,
        (row) => [row.taskId, row.chatId, row.createdAt],
      );
      await executor.query(
        "SELECT setval('task_events_sequence_seq', COALESCE((SELECT MAX(sequence) FROM task_events), 1), EXISTS (SELECT 1 FROM task_events))",
      );
      await executor.query(
        "SELECT setval('task_comments_sequence_seq', COALESCE((SELECT MAX(sequence) FROM task_comments), 1), EXISTS (SELECT 1 FROM task_comments))",
      );
      await executor.query(
        "INSERT INTO sqlite_imports (source_key, source_sha256, summary) VALUES ($1, $2, $3)",
        [sourceKey, sourceHash, JSON.stringify(summary)],
      );
      return summary;
    });
  } finally {
    database.close();
  }
};
