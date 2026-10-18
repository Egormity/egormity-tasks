import { z } from "zod";
import { taskSchema, tagSchema } from "./board.js";

export const taskSelectionSchema = z.object({ taskId: z.string().min(1).max(160).optional() });

/** Only main builds this snapshot from its database; the public message schema strips it. */
export const boardTaskContextSchema = z.object({
  task: taskSchema,
  tags: z.array(tagSchema),
  url: z.url(),
  verdict: z
    .object({
      url: z.url(),
      token: z.string().regex(/^[a-f0-9]{64}$/u),
      chatId: z.uuid(),
      revision: z.number().int().positive(),
    })
    .optional(),
});
export type BoardTaskContext = z.infer<typeof boardTaskContextSchema>;
