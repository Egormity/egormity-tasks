import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { BoardDivider, Task } from "../contracts/board.js";
import {
  boardColumns as defaultBoardColumns,
  boardColumnsSchema,
  boardDividerSchema,
} from "../contracts/board-columns.js";
import { HttpError } from "../http-error.js";
import { PostgresDatabase } from "../database/database.js";
import { BoardRepository } from "./board-repository.js";

const storedBoardDividerSchema = z
  .object({
    id: z.string().min(1).max(160),
    title: z.string().trim().min(1).max(120).optional(),
    columnId: z.string().min(1).max(160).optional(),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();

type OrderedBoardItem =
  | { readonly kind: "card"; readonly id: string; readonly card: Task }
  | { readonly kind: "divider"; readonly id: string; readonly divider: BoardDivider };

export class BoardLayoutStore {
  private readonly repository: BoardRepository;

  constructor(private readonly db: PostgresDatabase) {
    this.repository = new BoardRepository(db);
  }

  initialize = async () => {
    await this.db.query(
      "INSERT INTO board_settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      ["columns", JSON.stringify(defaultBoardColumns)],
    );
    await this.db.query(
      "INSERT INTO board_settings (key, data) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      ["dividers", "[]"],
    );
  };

  columns = async (repository = this.repository) =>
    boardColumnsSchema.parse(await repository.setting("columns", defaultBoardColumns));

  dividers = async (repository = this.repository): Promise<BoardDivider[]> => {
    const stored = z
      .array(storedBoardDividerSchema)
      .parse(await repository.setting<unknown>("dividers", []));
    const columns = await this.columns(repository);
    const legacyColumnId = columns[0]!.id;
    const cards = await repository.cards();
    const existingTasks = cards.filter(
      (card) => card.status === legacyColumnId && !card.archivedAt,
    );
    const legacyOrder = Math.max(-1, ...existingTasks.map(({ order }) => order)) + 1;
    let legacyIndex = 0;
    return stored.map((item, index) => {
      const order = item.order ?? legacyOrder + legacyIndex++;
      return boardDividerSchema.parse({
        id: item.id,
        title: item.title ?? `Раздел ${index + 1}`,
        columnId: item.columnId ?? legacyColumnId,
        order,
      });
    });
  };

  columnItems = async (
    columnId: string,
    excludingCardId?: string,
    repository = this.repository,
  ): Promise<OrderedBoardItem[]> => {
    const [cards, dividers] = await Promise.all([
      repository.cards(),
      this.dividers(repository),
    ]);
    const items: OrderedBoardItem[] = [
      ...cards
        .filter(
          (card) => card.status === columnId && !card.archivedAt && card.id !== excludingCardId,
        )
        .map((card) => ({ kind: "card" as const, id: card.id, card })),
      ...dividers
        .filter((divider) => divider.columnId === columnId)
        .map((divider) => ({ kind: "divider" as const, id: divider.id, divider })),
    ];
    return items.sort((first, second) => {
      const orderDifference =
        (first.kind === "card" ? first.card.order : first.divider.order) -
        (second.kind === "card" ? second.card.order : second.divider.order);
      return orderDifference || first.id.localeCompare(second.id);
    });
  };

  writeColumnOrder = async (
    items: readonly OrderedBoardItem[],
    primaryCardId?: string,
    repository = this.repository,
  ) => {
    const dividers = await this.dividers(repository);
    let dividerChanged = false;
    for (const [order, item] of items.entries()) {
      if (item.kind === "card") {
        if (item.id === primaryCardId) await repository.saveCard({ ...item.card, order });
        else if (item.card.order !== order)
          await repository.saveCard({ ...item.card, order, revision: item.card.revision + 1 });
        continue;
      }
      const index = dividers.findIndex((divider) => divider.id === item.id);
      if (index >= 0 && dividers[index]!.order !== order) {
        dividers[index] = { ...dividers[index]!, order };
        dividerChanged = true;
      }
    }
    if (dividerChanged) await repository.saveSetting("dividers", dividers);
  };

  createColumn = (input: { label: string; accent: string }) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const columns = await this.columns(repository);
      if (columns.length >= 20)
        throw new HttpError(409, "The board can have at most 20 columns.");
      const column = { ...input, id: `column-${randomUUID()}` };
      await repository.saveSetting("columns", boardColumnsSchema.parse([...columns, column]));
      return column;
    });

  updateColumn = (id: string, input: { label: string; accent: string }) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const columns = await this.columns(repository);
      const current = columns.find((column) => column.id === id);
      if (!current) throw new HttpError(404, "Column not found.");
      const saved = { ...current, ...input };
      await repository.saveSetting(
        "columns",
        boardColumnsSchema.parse(columns.map((column) => (column.id === id ? saved : column))),
      );
      return saved;
    });

  reorderColumns = (ids: string[]) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const columns = await this.columns(repository);
      if (
        ids.length !== columns.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !columns.some((column) => column.id === id))
      )
        throw new HttpError(400, "Column order must include every column exactly once.");
      const byId = new Map(columns.map((column) => [column.id, column]));
      const updated = ids.map((id) => byId.get(id)!);
      await repository.saveSetting("columns", updated);
      return updated;
    });

  deleteColumn = (id: string) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const columns = await this.columns(repository);
      if (!columns.some((column) => column.id === id))
        throw new HttpError(404, "Column not found.");
      if (columns.length <= 1)
        throw new HttpError(409, "The last board column cannot be deleted.");
      if ((await repository.cards()).some((card) => card.status === id))
        throw new HttpError(409, "Move or archive the column's tasks before deleting it.");
      if ((await this.dividers(repository)).some((divider) => divider.columnId === id))
        throw new HttpError(409, "Remove the column's dividers before deleting it.");
      await repository.saveSetting(
        "columns",
        columns.filter((column) => column.id !== id),
      );
      return { id };
    });

  addDivider = (input: { title: string; columnId: string }) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      if (!(await this.columns(repository)).some(({ id }) => id === input.columnId))
        throw new HttpError(400, "Choose a current board column.");
      const items = await this.columnItems(input.columnId, undefined, repository);
      const divider: BoardDivider = {
        id: randomUUID(),
        title: input.title,
        columnId: input.columnId,
        order: items.length
          ? Math.max(
              ...items.map((item) =>
                item.kind === "card" ? item.card.order : item.divider.order,
              ),
            ) + 1
          : 0,
      };
      const dividers = await this.dividers(repository);
      dividers.push(divider);
      await repository.saveSetting("dividers", dividers);
      return divider;
    });

  updateDivider = (id: string, title: string) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const dividers = await this.dividers(repository);
      const index = dividers.findIndex((divider) => divider.id === id);
      if (index < 0) throw new HttpError(404, "Divider not found.");
      const updated = { ...dividers[index]!, title };
      dividers[index] = updated;
      await repository.saveSetting("dividers", dividers);
      return updated;
    });

  deleteDivider = (id: string) =>
    this.db.transaction(async (executor) => {
      const repository = new BoardRepository(executor);
      const dividers = await this.dividers(repository);
      if (!dividers.some((divider) => divider.id === id))
        throw new HttpError(404, "Divider not found.");
      await repository.saveSetting(
        "dividers",
        dividers.filter((divider) => divider.id !== id),
      );
      return { id };
    });
}
