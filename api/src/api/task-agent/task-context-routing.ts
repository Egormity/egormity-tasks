import { Router, type RequestHandler } from "express";
import { HttpError } from "../auth/auth.js";
import type { BoardStore } from "../board/board-store.js";
import type { TaskChatStore } from "./task-chat-store.js";
import { taskSelectionSchema } from "../contracts/task-context.js";
import { verdictToken } from "./task-verdict.js";

/** Main owns task links and supplies task data from the board database. */
export const taskContextRouting = (
  board: BoardStore,
  links: TaskChatStore,
  publicUrl: string,
  workerToken: string,
) => {
  const router = Router();
  const select: RequestHandler = (req, res, next) => {
    const selection = taskSelectionSchema.safeParse(
      req.method === "GET" || req.method === "HEAD" ? req.query : (req.body ?? {}),
    );
    if (!selection.success) throw new HttpError(400, "Invalid task selection.");
    const chatId = req.params.id ?? req.query.chatId;
    const linked = links.list().find((link) => link.chatId === chatId);
    const taskId = selection.data.taskId;
    if (taskId) {
      board.get(taskId);
      if (linked && linked.taskId !== taskId)
        throw new HttpError(409, "This conversation is not linked to this task.");
    }
    const selectedId = taskId ?? linked?.taskId;
    if (selectedId && req.path.endsWith("/messages")) {
      if (typeof chatId !== "string")
        throw new HttpError(400, "Invalid conversation selection.");
      const task = board.get(selectedId);
      const url = new URL("/tasks", publicUrl);
      url.searchParams.set("task", task.id);
      res.locals.boardTaskContext = {
        task,
        tags: board.tags().filter((tag) => task.tagIds.includes(tag.id)),
        url: url.href,
        verdict: {
          url: new URL(`/api/agent/tasks/${encodeURIComponent(task.id)}/verdict`, publicUrl)
            .href,
          token: verdictToken(workerToken, task.id, chatId, task.revision),
          chatId,
          revision: task.revision,
        },
      };
    }
    next();
  };
  router.post("/chats", select);
  router.post("/chats/:id/messages", select);
  router.get("/context", select);
  return router;
};
