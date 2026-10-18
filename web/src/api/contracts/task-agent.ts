import { z } from "zod";

export const taskChatInputSchema = z
  .object({
    chatId: z.uuid(),
  })
  .strict();
export type TaskChatInput = z.infer<typeof taskChatInputSchema>;
export type TaskChatLink = {
  taskId: string;
  taskTitle: string;
  chatId: string;
  createdAt: string;
};
export type ChatScope = "general" | "tasks";
