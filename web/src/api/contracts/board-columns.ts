import { z } from "zod";

/** Keep the defaults in sync with api/src/api/contracts/board-columns.ts. */
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

export const boardColumnSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/u),
    label: z.string().trim().min(1).max(80),
    accent: z.string().regex(/^(?:#[0-9a-fA-F]{6}|var\(--color-board-[a-z-]+\))$/u),
  })
  .strict();

export const boardColumnsSchema = z
  .array(boardColumnSchema)
  .min(1)
  .max(20)
  .refine((columns) => new Set(columns.map(({ id }) => id)).size === columns.length);

export const boardDividerSchema = z
  .object({
    id: z.string().min(1).max(160),
    title: z.string().trim().min(1).max(120),
    columnId: z.string().min(1).max(160),
    order: z.number().int().nonnegative(),
  })
  .strict();

export const boardDividerInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    columnId: z.string().min(1).max(160),
  })
  .strict();

export const boardDividerMoveInputSchema = z
  .object({
    columnId: z.string().min(1).max(160),
    beforeId: z.string().min(1).max(160).nullable(),
  })
  .strict();

export type BoardColumn = z.infer<typeof boardColumnSchema>;
export type TaskStatus = string;
export type BoardDivider = z.infer<typeof boardDividerSchema>;
export type BoardDividerMoveInput = z.infer<typeof boardDividerMoveInputSchema>;

export const taskStatuses = boardColumns.map(({ id }) => id) as [TaskStatus, ...TaskStatus[]];
