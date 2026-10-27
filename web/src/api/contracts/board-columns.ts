/**
 * Web's local contract copy mirrors api/src/api/contracts/board-columns.ts.
 * Task status values are stored as strings, so updating this array needs no DB migration.
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
