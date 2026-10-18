import { Router } from "express";
import { z } from "zod";
import type { InternalTasksEnvironment } from "../config.js";
import { HttpError } from "../auth/auth.js";
import type { BoardStore } from "../board/board-store.js";
import type { BoardEvents } from "../board/board-events.js";
import type { TaskChatStore } from "./task-chat-store.js";
import type { Snapshot, Thread } from "../contracts/agent.js";
import { taskChatInputSchema } from "../contracts/task-agent.js";

export const taskAgentRoutes = (
  config: InternalTasksEnvironment,
  board: BoardStore,
  links: TaskChatStore,
  events: BoardEvents,
) => {
  const router = Router();
  const worker = async <T>(path: string): Promise<T> => {
    let response: globalThis.Response;
    try {
      response = await fetch(`${config.workerUrl}${path}`, {
        redirect: "error",
        headers: {
          Authorization: `Bearer ${config.workerToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new HttpError(503, "The Codex worker is unavailable.");
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      throw new HttpError(response.status, error.error ?? "The Codex worker is unavailable.");
    }
    return (await response.json()) as T;
  };

  router.post("/board/cards/:id/chats", async (req, res) => {
    const parsed = taskChatInputSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid task chat request.");
    const taskId = req.params.id;
    board.get(taskId);
    const { chatId } = parsed.data;
    // A draft is not a task chat. Only bind an existing native conversation with input.
    const thread = await worker<Thread>(`/chats/${chatId}`);
    if (
      thread.id !== chatId ||
      thread.parentThreadId ||
      !thread.turns.some((turn) => turn.items.some((item) => item.type === "userMessage"))
    )
      throw new HttpError(409, "Send the first message before linking this conversation.");
    const link = links.link(taskId, chatId);
    events.changed();
    res.json(link);
  });

  router.get("/chats/:id/task", (req, res) => {
    const link = links.list().find((item) => item.chatId === req.params.id);
    res.json(link ? board.get(link.taskId) : null);
  });

  router.get("/snapshot", async (req, res) => {
    const input = z
      .object({
        chatId: z.uuid().optional(),
        sinceTurnId: z.string().max(160).optional(),
        taskId: z.string().min(1).max(160).optional(),
        scope: z.enum(["general", "tasks"]).optional(),
      })
      .safeParse(req.query);
    if (!input.success) throw new HttpError(400, "Invalid conversation selection.");
    const { chatId, taskId, sinceTurnId, scope } = input.data;
    const taskChats = links.list();
    const selected = taskChats.find((link) => link.chatId === chatId);
    if (taskId) {
      board.get(taskId);
      if (chatId && selected?.taskId !== taskId)
        throw new HttpError(409, "This conversation is not linked to this task.");
    }
    const chatScope = scope ?? (selected ? "tasks" : "general");
    const query = new URLSearchParams();
    if (chatId) query.set("chatId", chatId);
    if (sinceTurnId) query.set("sinceTurnId", sinceTurnId);
    const snapshot = await worker<Snapshot>(`/snapshot${query.size ? `?${query}` : ""}`);
    const linked = new Set(
      taskChats.filter((link) => !taskId || link.taskId === taskId).map((link) => link.chatId),
    );
    res.json({
      ...snapshot,
      chats: snapshot.chats.filter((chat) =>
        taskId || chatScope === "tasks" ? linked.has(chat.id) : !linked.has(chat.id),
      ),
      linkedTask: selected ? board.get(selected.taskId) : null,
      taskChats,
      chatScope,
    });
  });
  return router;
};
