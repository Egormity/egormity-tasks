import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import type { BoardImport, Task } from "../contracts/board.js";

import { importBoard } from "./board-import.js";
import { BoardStore } from "./board-store.js";
import { BoardDatabase } from "./database.js";

let directory: string;

let chats: BoardDatabase;

let board: BoardStore;

let bundle: BoardImport;

const bytes = Buffer.from("source file contents");

const hash = createHash("sha256").update(bytes).digest("hex");

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "operations-board-"));
  mkdirSync(join(directory, "files"));
  chats = new BoardDatabase(join(directory, "chat.sqlite"));
  board = new BoardStore(chats.db);
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
  chats.close();
  rmSync(directory, { recursive: true, force: true });
});

const importFixture = () => {
  writeFileSync(join(directory, "board.json"), JSON.stringify(bundle));
  return importBoard(board, directory);
};

it("preserves source identities, archive, metadata, history and bytes across restart using only the board database", () => {
  expect(importFixture()).toMatchObject({
    cards: 1,
    tags: 1,
    events: 1,
    files: 1,
    unavailableFiles: 1,
  });
  chats.close();
  chats = new BoardDatabase(join(directory, "chat.sqlite"));
  board = new BoardStore(chats.db);
  expect(board.get("source-card")).toEqual(bundle.cards[0]);
  expect(board.events("source-card")).toEqual(bundle.events);
  expect(
    Buffer.from(chats.db.prepare("SELECT bytes FROM task_files").get()!.bytes as Uint8Array),
  ).toEqual(bytes);
  expect(
    chats.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chats'")
      .get(),
  ).toBeUndefined();
  const updated = board.update(
    "source-card",
    { revision: 1, title: "Edited after import" },
    "Administrator",
  );
  expect(importFixture()).toMatchObject({ alreadyImported: true });
  expect(board.get("source-card")).toEqual(updated);
  bundle.cards[0]!.title = "Changed source";
  expect(importFixture).toThrow("already imported");
});

it("rolls back the complete import on corrupted bytes or inconsistent references", () => {
  writeFileSync(join(directory, "files", hash), "corrupted");
  expect(importFixture).toThrow("integrity");
  expect(board.snapshot()).toEqual({ cards: [], tags: [] });
  expect(chats.db.prepare("SELECT count(*) AS count FROM task_imports").get()?.count).toBe(0);
  writeFileSync(join(directory, "files", hash), bytes);
  bundle.events[0]!.cardId = "unknown-card";
  expect(importFixture).toThrow("unknown task");
  expect(board.cards()).toHaveLength(0);
});

it("requires an explicit record for every unavailable attachment and refuses populated destinations", () => {
  bundle.unavailableFiles = [];
  expect(importFixture).toThrow("explicitly accounted");
  board.create(
    {
      title: "Existing task",
      description: null,
      status: "backlog",
      priority: "medium",
      tagIds: [],
    },
    "Admin",
  );
  expect(importFixture).toThrow("empty board");
  expect(board.cards()).toHaveLength(1);
});
