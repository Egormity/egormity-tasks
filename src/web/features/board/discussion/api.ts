import type { TaskChatLink } from "@contracts/task-agent.js";
import type { Thread } from "@contracts/agent.js";
import { request } from "@/shared/http/api";

export const linkTaskChat = (taskId: string, chatId: string) =>
  request<TaskChatLink>(`/board/cards/${encodeURIComponent(taskId)}/chats`, { chatId });

export const createChat = async (taskId?: string) =>
  (await request<Thread>("/chats", taskId ? { taskId } : {})).id;
