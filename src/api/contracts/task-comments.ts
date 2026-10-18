import { z } from "zod";
import { attachmentSchema } from "./board.js";

export const commentLimits = {
  maxFiles: 10,
  maxBytes: 20 * 1024 * 1024,
  maxText: 8000,
} as const;
export const commentInputSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().max(commentLimits.maxText),
  })
  .strict();
export const taskCommentSchema = commentInputSchema.extend({
  cardId: z.string(),
  author: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.iso.datetime(),
  attachments: z.array(attachmentSchema),
});
export type TaskComment = z.infer<typeof taskCommentSchema>;
