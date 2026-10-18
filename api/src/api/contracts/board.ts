import { z } from "zod";
import type { TaskChatLink } from "./task-agent.js";

export const taskStatuses = [
  "backlog",
  "clarification",
  "queue",
  "inProgress",
  "review",
  "done",
] as const;

export const tagTones = ["violet", "green", "amber", "blue", "rose"] as const;

const id = z.string().min(1).max(160);

export const tagInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    tone: z.enum(tagTones),
  })
  .strict();

export const tagSchema = tagInputSchema.extend({ id });

export const attachmentSchema = z
  .object({
    id,
    name: z.string().min(1).max(240),
    size: z.number().int().nonnegative(),
    type: z.string().max(120).optional(),
    objectId: z.string().optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict();

export const taskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(8000).nullable(),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(taskStatuses),
    tagIds: z.array(id).max(30),
  })
  .strict();

export const taskSchema = taskInputSchema.extend({
  agentVerdict: z.string().max(8000).nullable().optional(),
  id,
  order: z.number().int().nonnegative(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  attachments: z.array(attachmentSchema),
  revision: z.number().int().positive(),
});

export const taskUpdateSchema = taskInputSchema
  .partial()
  .extend({
    revision: z.number().int().positive(),
    archived: z.boolean().optional(),
    beforeId: id.nullable().optional(),
    attachmentIds: z.array(id).max(10).optional(),
  })
  .strict();

export const taskEventSchema = z.object({
  id,
  cardId: id,
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const boardImportSchema = z
  .object({
    format: z.literal("amazi-operations-board-v1"),
    sourceProjectId: z.uuid(),
    exportedAt: z.iso.datetime(),
    cards: z.array(taskSchema),
    tags: z.array(tagSchema),
    events: z.array(taskEventSchema),
    unavailableFiles: z.array(
      z
        .object({
          cardId: id,
          attachmentId: id,
          reason: z.enum(["source-not-found", "missing-reference"]),
        })
        .strict(),
    ),
  })
  .strict();

export type Task = z.infer<typeof taskSchema>;

export type TaskInput = z.infer<typeof taskInputSchema>;

export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export type TaskTag = z.infer<typeof tagSchema>;

export type TaskEvent = z.infer<typeof taskEventSchema>;

export type TaskAttachment = z.infer<typeof attachmentSchema>;

export type BoardImport = z.infer<typeof boardImportSchema>;

export type BoardSnapshot = { cards: Task[]; tags: TaskTag[] };

export const boardChangeSchema = z.object({ version: z.string().uuid() });

export type LiveBoardSnapshot = BoardSnapshot &
  z.infer<typeof boardChangeSchema> & {
    taskChats?: TaskChatLink[];
  };
