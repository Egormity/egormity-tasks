import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { BoardImport, Task } from "../contracts/board.js";
import { createTestDatabase } from "../test-support/database.js";

import { importBoard } from "./board-import.js";
import { BoardStore } from "./board-store.js";
import type { PostgresDatabase } from "../database/database.js";

let directory: string;
let database: PostgresDatabase;
let board: BoardStore;
let bundle: BoardImport;

const bytes = Buffer.from("source file contents");

const hash = createHash("sha256").update(bytes).digest("hex");

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "operations-board-"));
  mkdirSync(join(directory, "files"));
  database = createTestDatabase();
  await database.migrate();
  board = new BoardStore(database);
  await board.initialize();
  const task: Task = {
    id: "source-card",
    title: "Imported task",
    description: "All source details",
    status: "review",
    priority: "high",
    order: 4,
    archivedAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    revision: 1,
    tagIds: ["source-tag"],
    attachments: [
      {
        id: "source-file",
        name: "source.txt",
        size: bytes.length,
        sha256: hash,
        objectId: "original-object",
      },
      { id: "missing", name: "missing.png", size: 10 },
    ],
  };
  bundle = {
    format: "amazi-operations-board-v1",
    sourceProjectId: "7ce039e5-ea5e-4f74-906c-51429c3e14ed",
    exportedAt: "2026-10-11T10:00:00.000Z",
    cards: [task],
    tags: [{ id: "source-tag", name: "Platform", tone: "blue" }],
    events: [
      {
        id: "source-event",
        cardId: task.id,
        type: "created",
        createdAt: task.createdAt,
        payload: { title: task.title },
      },
    ],
    unavailableFiles: [
      { cardId: task.id, attachmentId: "missing", reason: "missing-reference" },
    ],
  };
  writeFileSync(join(directory, "files", hash), bytes);
});

afterEach(() => {
  return database.close().then(() => {
    rmSync(directory, { recursive: true, force: true });
  });
});

const importFixture = async () => {
  writeFileSync(join(directory, "board.json"), JSON.stringify(bundle));
  return await importBoard(board, directory);
};

it("preserves task identities, archive, metadata, history and attachment bytes", async () => {
  expect(await importFixture()).toMatchObject({
    cards: 1,
    tags: 1,
    events: 1,
    files: 1,
    unavailableFiles: 1,
  });
  const reloadedBoard = new BoardStore(database);
  expect(await reloadedBoard.get("source-card")).toEqual(bundle.cards[0]);
  expect(await reloadedBoard.events("source-card")).toEqual(bundle.events);
  const storedFile = await database.query<{ encoded: string }>(
    "SELECT encode(bytes, 'hex') AS encoded FROM task_files",
  );
  expect(Buffer.from(storedFile[0]!.encoded, "hex")).toEqual(bytes);
  const updated = await reloadedBoard.update(
    "source-card",
    { revision: 1, title: "Edited after import" },
    "Administrator",
  );
  expect(await importFixture()).toMatchObject({ alreadyImported: true });
  expect(await reloadedBoard.get("source-card")).toEqual(updated);
  bundle.cards[0]!.title = "Changed source";
  await expect(importFixture()).rejects.toThrow("already imported");
});

it("rolls back the complete import on corrupted bytes or inconsistent references", async () => {
  writeFileSync(join(directory, "files", hash), "corrupted");
  await expect(importFixture()).rejects.toThrow("integrity");
  expect(await board.snapshot()).toMatchObject({ cards: [], tags: [], dividers: [] });
  const imports = await database.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM task_imports",
  );
  expect(imports[0]?.count).toBe(0);
  writeFileSync(join(directory, "files", hash), bytes);
  bundle.events[0]!.cardId = "unknown-card";
  await expect(importFixture()).rejects.toThrow("unknown task");
  expect(await board.cards()).toHaveLength(0);
});

it("requires explicit records for unavailable attachments and refuses populated destinations", async () => {
  bundle.unavailableFiles = [];
  await expect(importFixture()).rejects.toThrow("explicitly accounted");
  await board.create(
    {
      title: "Existing task",
      description: null,
      status: "backlog",
      priority: "medium",
      tagIds: [],
    },
    "Admin",
  );
  await expect(importFixture()).rejects.toThrow("empty board");
  expect(await board.cards()).toHaveLength(1);
});
