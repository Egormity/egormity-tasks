import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, json } from "express";
import { z } from "zod";
import { HttpError } from "../auth/auth.js";
import type { BoardStore } from "../board/board-store.js";
import type { BoardEvents } from "../board/board-events.js";
import type { TaskChatStore } from "./task-chat-store.js";

// This credential authorizes only one task/chat/revision, never generic board or relay access.
export const verdictToken = (key: string, taskId: string, chatId: string, revision: number) =>
  createHmac("sha256", key)
    .update(JSON.stringify(["task-verdict-v1", taskId, chatId, revision]))
    .digest("hex");

const inputSchema = z
  .object({
    chatId: z.uuid(),
    revision: z.number().int().positive(),
    verdict: z.string().trim().min(1).max(8000),
  })
  .strict();

export const taskVerdictRoutes = (
  key: string,
  board: BoardStore,
  links: TaskChatStore,
  events: BoardEvents,
) => {
  const router = Router();
  router.post("/agent/tasks/:id/verdict", json({ limit: "40kb" }), (req, res) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid task verdict.");
    const { chatId, revision, verdict } = parsed.data;
    const taskId = req.params.id;
    const token = req.headers.authorization?.replace(/^Bearer /u, "") ?? "";
    const expected = verdictToken(key, taskId, chatId, revision);
    if (
      !/^[a-f0-9]{64}$/u.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      throw new HttpError(403, "Invalid task verdict credential.");
    if (!links.list().some((link) => link.taskId === taskId && link.chatId === chatId))
      throw new HttpError(409, "This conversation is no longer linked to this task.");
    const card = board.transaction(() => {
      const current = board.get(taskId);
      // Retrying an acknowledged or lost response cannot create another event or overwrite edits.
      if (current.revision === revision + 1 && current.agentVerdict === verdict) return current;
      board.checkRevision(current, revision);
      const updated = {
        ...current,
        agentVerdict: verdict,
        revision: revision + 1,
        updatedAt: new Date().toISOString(),
      };
      board.save(updated);
      board.event(taskId, "content_changed", {
        actor: "Codex",
        chatId,
        changes: [{ field: "agentVerdict", from: current.agentVerdict ?? null, to: verdict }],
      });
      return updated;
    });
    events.changed();
    res.json({ taskId: card.id, revision: card.revision, saved: true });
  });
  return router;
};
