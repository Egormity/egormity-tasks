import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { boardImportSchema } from "../contracts/board.js";

import type { BoardStore } from "./board-store.js";
import { BoardRepository } from "./board-repository.js";

export const importBoard = async (store: BoardStore, directory: string) => {
  const raw = readFileSync(join(directory, "board.json"));
  const data = boardImportSchema.parse(JSON.parse(raw.toString("utf8")));
  const digest = createHash("sha256").update(raw).digest("hex");
  const previous = await store.db.query<{ digest: string; data: string }>(
    "SELECT digest, data FROM task_imports WHERE source = $1",
    [data.sourceProjectId],
  );
  if (previous.length) {
    if (previous[0]!.digest !== digest)
      throw new Error(
        "This source was already imported with different content. Refusing to overwrite tasks.",
      );
    return {
      ...(JSON.parse(previous[0]!.data) as Record<string, unknown>),
      alreadyImported: true,
    };
  }
  if ((await store.cards()).length || (await store.tags()).length)
    throw new Error("Initial board import requires an empty board.");
  const cards = new Map(data.cards.map((card) => [card.id, card]));
  const tags = new Set(data.tags.map((tag) => tag.id));
  if (
    cards.size !== data.cards.length ||
    tags.size !== data.tags.length ||
    new Set(data.events.map((event) => event.id)).size !== data.events.length
  )
    throw new Error("Duplicate source identifiers.");
  const unavailable = new Set(
    data.unavailableFiles.map((file) => JSON.stringify([file.cardId, file.attachmentId])),
  );
  const expectedMissing = new Set<string>();
  const files = new Map<string, number>();
  for (const card of data.cards) {
    if (card.tagIds.some((id) => !tags.has(id))) throw new Error("Unknown source tag.");
    if (new Set(card.attachments.map((file) => file.id)).size !== card.attachments.length)
      throw new Error("Duplicate attachment identifiers.");
    for (const file of card.attachments) {
      if (file.sha256) {
        if (files.has(file.sha256) && files.get(file.sha256) !== file.size)
          throw new Error("Inconsistent file sizes.");
        files.set(file.sha256, file.size);
      } else expectedMissing.add(JSON.stringify([card.id, file.id]));
    }
  }
  if (
    unavailable.size !== data.unavailableFiles.length ||
    unavailable.size !== expectedMissing.size ||
    [...expectedMissing].some((key) => !unavailable.has(key))
  )
    throw new Error("Every unavailable attachment must be explicitly accounted for.");
  if (data.events.some((event) => !cards.has(event.cardId)))
    throw new Error("History references an unknown task.");
  const summary = {
    sourceProjectId: data.sourceProjectId,
    exportedAt: data.exportedAt,
    cards: data.cards.length,
    tags: data.tags.length,
    events: data.events.length,
    files: files.size,
    unavailableFiles: unavailable.size,
    alreadyImported: false,
  };
  return store.db.transaction(async (executor) => {
    const repository = new BoardRepository(executor);
    for (const [hash, size] of files) {
      const bytes = readFileSync(join(directory, "files", hash));
      if (bytes.length !== size || createHash("sha256").update(bytes).digest("hex") !== hash)
        throw new Error("Attachment integrity check failed.");
      await repository.insertFile(hash, bytes);
    }
    for (const tag of data.tags) await repository.saveTag(tag);
    for (const card of data.cards) {
      await store.validateTags(card.tagIds, repository);
      await repository.saveCard(card);
    }
    for (const event of data.events) await repository.event(event);
    await executor.query(
      "INSERT INTO task_imports (source, digest, data) VALUES ($1, $2, $3)",
      [data.sourceProjectId, digest, JSON.stringify(summary)],
    );
    return summary;
  });
};
