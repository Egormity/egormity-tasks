/**
 * The board's single source of truth. Column IDs are persisted as plain task status strings,
 * not as a database enum, so adding or reordering a column does not require a database migration.
 */
export const boardColumns = [
  { id: "backlog", label: "Бэк лог", accent: "var(--color-board-backlog)" },
  {
    id: "clarification",
    label: "Нужно уточнение / дизайн",
    accent: "var(--color-board-clarification)",
  },
  { id: "queue", label: "Очередь", accent: "var(--color-board-queue)" },
  { id: "inProgress", label: "Готово к публикации", accent: "var(--color-board-ready)" },
  { id: "review", label: "Приёмка", accent: "var(--color-board-review)" },
  { id: "done", label: "Готово", accent: "var(--color-board-done)" },
] as const;

export type BoardColumn = (typeof boardColumns)[number];
export type TaskStatus = BoardColumn["id"];

export const taskStatuses = boardColumns.map(({ id }) => id) as [TaskStatus, ...TaskStatus[]];
