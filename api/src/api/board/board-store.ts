import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  BoardSnapshot,
  Task,
  TaskAttachment,
  TaskEvent,
  TaskInput,
  TaskTag,
  TaskUpdate,
} from "../contracts/board.js";

import { HttpError } from "../auth/auth.js";
import { CommentStore } from "./comments/comment-store.js";
import { taskSchema } from "../contracts/board.js";

export class BoardStore {
  readonly comments: CommentStore;
  constructor(readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_cards (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_tags (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY, cardId TEXT NOT NULL REFERENCES task_cards(id), data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_events_card ON task_events(cardId);
      CREATE TABLE IF NOT EXISTS task_files (sha256 TEXT PRIMARY KEY, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS task_imports (source TEXT PRIMARY KEY, digest TEXT NOT NULL, data TEXT NOT NULL);
    `);
    this.comments = new CommentStore(this);
  }

  transaction = <T>(action: () => T): T => {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  };

  cards = (): Task[] =>
    this.db
      .prepare("SELECT data FROM task_cards")
      .all()
      .map((row) => taskSchema.parse(JSON.parse(String(row.data))))
      .sort(
        (a, b) =>
          a.order - b.order ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );

  tags = (): TaskTag[] =>
    this.db
      .prepare("SELECT data FROM task_tags ORDER BY name")
      .all()
      .map((row) => JSON.parse(String(row.data)) as TaskTag);

  snapshot = (): BoardSnapshot => ({ cards: this.cards(), tags: this.tags() });

  get = (id: string): Task => {
    const row = this.db.prepare("SELECT data FROM task_cards WHERE id = ?").get(id);
    if (!row) throw new HttpError(404, "Task not found.");
    return taskSchema.parse(JSON.parse(String(row.data)));
  };

  save = (card: Task) =>
    this.db
      .prepare(
        "INSERT INTO task_cards VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .run(card.id, JSON.stringify(card));

  event = (cardId: string, type: string, payload: Record<string, unknown>) => {
    const event: TaskEvent = {
      id: randomUUID(),
      cardId,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO task_events VALUES (?, ?, ?)")
      .run(event.id, cardId, JSON.stringify(event));
  };

  events = (id: string): TaskEvent[] => {
    this.get(id);
    return this.db
      .prepare("SELECT data FROM task_events WHERE cardId = ? ORDER BY rowid")
      .all(id)
      .map((row) => JSON.parse(String(row.data)) as TaskEvent)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  };

  validateTags = (ids: string[]) => {
    const known = new Set(this.tags().map((tag) => tag.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id)))
      throw new HttpError(400, "One or more tags do not exist.");
  };

  create = (input: TaskInput, actor: string): Task =>
    this.transaction(() => {
      this.validateTags(input.tagIds);
      const now = new Date().toISOString();
      const column = this.cards().filter(
        (card) => card.status === input.status && !card.archivedAt,
      );
      column.forEach((card, index) => {
        const order = index + 1;
        if (card.order !== order) this.save({ ...card, order, revision: card.revision + 1 });
      });
      const card: Task = {
        ...input,
        id: randomUUID(),
        order: 0,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        attachments: [],
        revision: 1,
      };
      this.save(card);
      this.event(card.id, "created", { actor });
      return card;
    });

  update = (id: string, input: TaskUpdate, actor: string): Task =>
    this.transaction(() => {
      const current = this.get(id);
      this.checkRevision(current, input.revision);
      if (input.tagIds) this.validateTags(input.tagIds);
      const { revision: _revision, archived, beforeId, attachmentIds, ...fields } = input;
      void _revision;
      if (
        attachmentIds?.some(
          (attachmentId) => !current.attachments.some((a) => a.id === attachmentId),
        )
      )
        throw new HttpError(400, "Attachment not found.");
      const card: Task = {
        ...current,
        title: fields.title ?? current.title,
        description:
          fields.description === undefined ? current.description : fields.description,
        priority: fields.priority ?? current.priority,
        status: fields.status ?? current.status,
        tagIds: fields.tagIds ?? current.tagIds,
        attachments:
          attachmentIds === undefined
            ? current.attachments
            : current.attachments.filter((a) => attachmentIds.includes(a.id)),
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        archivedAt:
          archived === undefined
            ? current.archivedAt
            : archived
              ? new Date().toISOString()
              : null,
      };
      if (beforeId !== undefined || card.status !== current.status || archived === false) {
        const column = this.cards().filter(
          (c) => c.id !== id && !c.archivedAt && c.status === card.status,
        );
        const position = beforeId ? column.findIndex((c) => c.id === beforeId) : column.length;
        if (position < 0) throw new HttpError(409, "The board changed. Refresh and try again.");
        column.splice(position, 0, card);
        column.forEach((item, order) => {
          if (item.id === id) card.order = order;
          else if (item.order !== order)
            this.save({ ...item, order, revision: item.revision + 1 });
        });
      }
      this.save(card);
      const changes = Object.entries(card)
        .filter(
          ([field, value]) =>
            !["revision", "updatedAt"].includes(field) &&
            JSON.stringify(value) !== JSON.stringify(current[field as keyof Task]),
        )
        .map(([field, value]) => {
          if (field === "attachments")
            return {
              field,
              added: card.attachments.filter(
                (item) => !current.attachments.some((old) => old.id === item.id),
              ),
              removed: current.attachments.filter(
                (item) => !card.attachments.some((next) => next.id === item.id),
              ),
            };
          if (field === "tagIds") {
            const names = new Map(this.tags().map((tag) => [tag.id, tag.name]));
            return {
              field: "tags",
              added: card.tagIds
                .filter((id) => !current.tagIds.includes(id))
                .map((id) => names.get(id) ?? id),
              removed: current.tagIds
                .filter((id) => !card.tagIds.includes(id))
                .map((id) => names.get(id) ?? id),
            };
          }
          return { field, from: current[field as keyof Task], to: value };
        });
      if (changes.length)
        this.event(
          id,
          archived === true ? "archived" : archived === false ? "restored" : "content_changed",
          { actor, changes },
        );
      return card;
    });

  checkRevision = (card: Task, revision: number) => {
    if (card.revision !== revision)
      throw new HttpError(409, "The task changed. Reopen it before saving.");
  };

  saveTag = (input: Omit<TaskTag, "id">, id: string = randomUUID()): TaskTag => {
    const duplicate = this.tags().find((tag) => tag.name === input.name && tag.id !== id);
    if (duplicate) throw new HttpError(409, "A tag with this name already exists.");
    const tag = { ...input, id };
    this.db
      .prepare(
        "INSERT INTO task_tags VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, data=excluded.data",
      )
      .run(id, tag.name, JSON.stringify(tag));
    return tag;
  };

  deleteTag = (id: string, actor: string) =>
    this.transaction(() => {
      const tag = this.tags().find((item) => item.id === id);
      if (!tag) throw new HttpError(404, "Tag not found.");
      let removedCards = 0;
      for (const card of this.cards()) {
        if (!card.tagIds.includes(id)) continue;
        this.save({
          ...card,
          tagIds: card.tagIds.filter((tagId) => tagId !== id),
          revision: card.revision + 1,
          updatedAt: new Date().toISOString(),
        });
        this.event(card.id, "content_changed", {
          actor,
          changes: [{ field: "tags", removed: [tag.name] }],
        });
        removedCards += 1;
      }
      this.db.prepare("DELETE FROM task_tags WHERE id = ?").run(id);
      return { id, removedCards };
    });

  attach = (
    id: string,
    revision: number,
    attachment: TaskAttachment,
    bytes: Buffer,
    actor: string,
  ): Task =>
    this.transaction(() => {
      const card = this.get(id);
      this.checkRevision(card, revision);
      const existing = card.attachments.find((item) => item.id === attachment.id);
      if (existing) {
        if (existing.sha256 !== attachment.sha256)
          throw new HttpError(409, "Attachment already exists.");
        return card;
      }
      if (card.attachments.length >= 10)
        throw new HttpError(400, "A task can have up to ten attachments.");
      this.db
        .prepare("INSERT OR IGNORE INTO task_files VALUES (?, ?)")
        .run(attachment.sha256!, bytes);
      const updated = {
        ...card,
        attachments: [...card.attachments, attachment],
        revision: card.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.save(updated);
      this.event(id, "content_changed", {
        actor,
        changes: [{ field: "attachments", added: [attachment] }],
      });
      return updated;
    });

  detach = (id: string, revision: number, attachmentId: string, actor: string): Task =>
    this.transaction(() => {
      const card = this.get(id);
      this.checkRevision(card, revision);
      const removed = card.attachments.find((a) => a.id === attachmentId);
      if (!removed) throw new HttpError(404, "Attachment not found.");
      const updated = {
        ...card,
        attachments: card.attachments.filter((a) => a.id !== attachmentId),
        revision: card.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.save(updated);
      this.event(id, "content_changed", {
        actor,
        changes: [{ field: "attachments", removed: [removed] }],
      });
      return updated;
    });
}
