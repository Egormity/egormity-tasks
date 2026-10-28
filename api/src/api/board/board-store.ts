import { randomUUID } from "node:crypto";

import type {
  BoardSnapshot,
  Task,
  TaskAttachment,
  TaskEvent,
  TaskInput,
  TaskTag,
  TaskUpdate,
} from "../contracts/board.js";
import { taskSchema } from "../contracts/board.js";
import type { QueryExecutor } from "../database/database.js";
import { PostgresDatabase } from "../database/database.js";
import { HttpError } from "../http-error.js";
import { CommentStore } from "./comments/comment-store.js";
import { BoardLayoutStore } from "./board-layout-store.js";
import { BoardRepository } from "./board-repository.js";

export class BoardStore {
  readonly comments: CommentStore;
  readonly layout: BoardLayoutStore;
  private readonly repository: BoardRepository;

  constructor(readonly db: PostgresDatabase) {
    this.repository = new BoardRepository(db);
    this.layout = new BoardLayoutStore(db);
    this.comments = new CommentStore(db, this);
  }

  initialize = () => this.layout.initialize();

  columns = () => this.layout.columns();

  dividers = () => this.layout.dividers();

  cards = async (repository = this.repository): Promise<Task[]> =>
    (await repository.cards())
      .map((card) => taskSchema.parse(card))
      .sort(
        (a, b) =>
          a.order - b.order ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );

  tags = (repository = this.repository) => repository.tags();

  snapshot = async (): Promise<BoardSnapshot> => ({
    cards: await this.cards(),
    tags: await this.tags(),
    columns: await this.columns(),
    dividers: await this.dividers(),
  });

  get = async (id: string, executor: QueryExecutor = this.db): Promise<Task> => {
    const card = await new BoardRepository(executor).card(id);
    if (!card) throw new HttpError(404, "Task not found.");
    return taskSchema.parse(card);
  };

  save = (card: Task, executor: QueryExecutor = this.db) =>
    new BoardRepository(executor).saveCard(card);

  event = async (
    cardId: string,
    type: string,
    payload: Record<string, unknown>,
    executor: QueryExecutor = this.db,
  ) => {
    const event: TaskEvent = {
      id: randomUUID(),
      cardId,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    await new BoardRepository(executor).event(event);
  };

  events = async (id: string): Promise<TaskEvent[]> => {
    await this.get(id);
    return (await this.repository.events(id)).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  };

  getFile = (sha256: string) => this.repository.fileBytes(sha256);

  listComments = (cardId: string) => this.repository.comments(cardId);

  validateTags = async (ids: string[], repository = this.repository) => {
    const known = new Set((await repository.tags()).map((tag) => tag.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id)))
      throw new HttpError(400, "One or more tags do not exist.");
  };

  create = (input: TaskInput, actor: string) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      if (!(await this.layout.columns(repository)).some((column) => column.id === input.status))
        throw new HttpError(400, "Choose a current board column.");
      await this.validateTags(input.tagIds, repository);
      const now = new Date().toISOString();
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
      const items = await this.layout.columnItems(input.status, undefined, repository);
      await this.layout.writeColumnOrder(
        [{ kind: "card", id: card.id, card }, ...items],
        card.id,
        repository,
      );
      await this.event(card.id, "created", { actor }, executor);
      return card;
    });

  update = (id: string, input: TaskUpdate, actor: string) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const current = await this.get(id, executor);
      this.checkRevision(current, input.revision);
      if (input.tagIds) await this.validateTags(input.tagIds, repository);
      const { revision: _revision, archived, beforeId, attachmentIds, ...fields } = input;
      void _revision;
      if (
        fields.status &&
        !(await this.layout.columns(repository)).some((column) => column.id === fields.status)
      )
        throw new HttpError(400, "Choose a current board column.");
      if (
        attachmentIds?.some(
          (attachmentId) =>
            !current.attachments.some((attachment) => attachment.id === attachmentId),
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
            : current.attachments.filter((attachment) => attachmentIds.includes(attachment.id)),
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
        const column = await this.layout.columnItems(card.status, id, repository);
        const position = beforeId
          ? column.findIndex((item) => item.id === beforeId)
          : column.length;
        if (position < 0) throw new HttpError(409, "The board changed. Refresh and try again.");
        column.splice(position, 0, { kind: "card", id: card.id, card });
        if (current.status !== card.status && !current.archivedAt)
          await this.layout.writeColumnOrder(
            await this.layout.columnItems(current.status, id, repository),
            undefined,
            repository,
          );
        card.order = position;
        await this.layout.writeColumnOrder(column, id, repository);
      } else {
        await repository.saveCard(card);
      }

      const changedFields = Object.entries(card).filter(
        ([field, value]) =>
          !["revision", "updatedAt"].includes(field) &&
          JSON.stringify(value) !== JSON.stringify(current[field as keyof Task]),
      );
      const tagNames = changedFields.some(([field]) => field === "tagIds")
        ? new Map((await repository.tags()).map((tag) => [tag.id, tag.name]))
        : new Map<string, string>();
      const changes = changedFields.map(([field, value]) => {
        if (field === "attachments")
          return {
            field,
            added: card.attachments.filter(
              (attachment) => !current.attachments.some((old) => old.id === attachment.id),
            ),
            removed: current.attachments.filter(
              (attachment) => !card.attachments.some((next) => next.id === attachment.id),
            ),
          };
        if (field === "tagIds") {
          return {
            field: "tags",
            added: card.tagIds
              .filter((tagId) => !current.tagIds.includes(tagId))
              .map((tagId) => tagNames.get(tagId) ?? tagId),
            removed: current.tagIds
              .filter((tagId) => !card.tagIds.includes(tagId))
              .map((tagId) => tagNames.get(tagId) ?? tagId),
          };
        }
        return { field, from: current[field as keyof Task], to: value };
      });
      if (changes.length)
        await this.event(
          id,
          archived === true ? "archived" : archived === false ? "restored" : "content_changed",
          { actor, changes },
          executor,
        );
      return card;
    });

  checkRevision = (card: Task, revision: number) => {
    if (card.revision !== revision)
      throw new HttpError(409, "The task changed. Reopen it before saving.");
  };

  saveTag = async (input: Omit<TaskTag, "id">, id: string = randomUUID()) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const duplicate = (await repository.tags()).find(
        (tag) => tag.name === input.name && tag.id !== id,
      );
      if (duplicate) throw new HttpError(409, "A tag with this name already exists.");
      const tag = { ...input, id };
      await repository.saveTag(tag);
      return tag;
    });

  deleteTag = (id: string, actor: string) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const tag = (await repository.tags()).find((item) => item.id === id);
      if (!tag) throw new HttpError(404, "Tag not found.");
      let removedCards = 0;
      for (const card of await this.cards(repository)) {
        if (!card.tagIds.includes(id)) continue;
        await repository.saveCard({
          ...card,
          tagIds: card.tagIds.filter((tagId) => tagId !== id),
          revision: card.revision + 1,
          updatedAt: new Date().toISOString(),
        });
        await this.event(
          card.id,
          "content_changed",
          { actor, changes: [{ field: "tags", removed: [tag.name] }] },
          executor,
        );
        removedCards += 1;
      }
      await repository.deleteTag(id);
      return { id, removedCards };
    });

  attach = (
    id: string,
    revision: number,
    attachment: TaskAttachment,
    bytes: Buffer,
    actor: string,
  ) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const card = await this.get(id, executor);
      this.checkRevision(card, revision);
      const existing = card.attachments.find((item) => item.id === attachment.id);
      if (existing) {
        if (existing.sha256 !== attachment.sha256)
          throw new HttpError(409, "Attachment already exists.");
        return card;
      }
      if (card.attachments.length >= 10)
        throw new HttpError(400, "A task can have up to ten attachments.");
      await repository.insertFile(attachment.sha256!, bytes);
      const updated = {
        ...card,
        attachments: [...card.attachments, attachment],
        revision: card.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await repository.saveCard(updated);
      await this.event(
        id,
        "content_changed",
        { actor, changes: [{ field: "attachments", added: [attachment] }] },
        executor,
      );
      return updated;
    });

  detach = (id: string, revision: number, attachmentId: string, actor: string) =>
    this.db.transaction(async (executor) => {
      const card = await this.get(id, executor);
      this.checkRevision(card, revision);
      const removed = card.attachments.find((attachment) => attachment.id === attachmentId);
      if (!removed) throw new HttpError(404, "Attachment not found.");
      const updated = {
        ...card,
        attachments: card.attachments.filter((attachment) => attachment.id !== attachmentId),
        revision: card.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.save(updated, executor);
      await this.event(
        id,
        "content_changed",
        { actor, changes: [{ field: "attachments", removed: [removed] }] },
        executor,
      );
      return updated;
    });
}
