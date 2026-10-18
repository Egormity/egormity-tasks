import { Router, raw } from "express";
import { createHash } from "node:crypto";
import { attachmentSchema } from "../../contracts/board.js";
import { commentInputSchema, commentLimits } from "../../contracts/task-comments.js";
import { HttpError } from "../../auth/auth.js";
import type { BoardStore } from "../board-store.js";
import type { BoardEvents } from "../board-events.js";

export const commentRoutes = (board: BoardStore, events: BoardEvents) => {
  const router = Router();
  router.get("/cards/:id/comments", (req, res) => res.json(board.comments.list(req.params.id)));
  router.post(
    "/cards/:id/comments",
    raw({ type: "multipart/form-data", limit: commentLimits.maxBytes + 64 * 1024 }),
    async (req, res) => {
      board.get(req.params.id);
      if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Invalid comment upload.");
      let form: FormData;
      try {
        form = await new Request("http://localhost/comments", {
          method: "POST",
          headers: { "content-type": req.headers["content-type"]! },
          body: new Uint8Array(req.body),
        }).formData();
      } catch {
        throw new HttpError(400, "Invalid comment upload.");
      }
      if (
        [...form.keys()].some((key) => !["id", "text", "files"].includes(key)) ||
        form.getAll("id").length !== 1 ||
        form.getAll("text").length !== 1
      )
        throw new HttpError(400, "Invalid comment data.");
      const input = commentInputSchema.safeParse({
        id: form.get("id"),
        text: form.get("text"),
      });
      if (!input.success) throw new HttpError(400, "Invalid comment data.");
      const entries = form.getAll("files");
      if (
        entries.length > commentLimits.maxFiles ||
        entries.some((file) => typeof file === "string" || !file.size)
      )
        throw new HttpError(400, "Choose up to ten non-empty files.");
      const files = entries as File[];
      if (files.reduce((sum, file) => sum + file.size, 0) > commentLimits.maxBytes)
        throw new HttpError(413, "Comment attachments must be at most 20 MB in total.");
      if (!input.data.text && !files.length)
        throw new HttpError(400, "Write a comment or attach a file.");
      const uploads = await Promise.all(
        files.map(async (file, index) => {
          const bytes = Buffer.from(await file.arrayBuffer());
          const attachment = attachmentSchema.safeParse({
            id: `${input.data.id}-${index}`,
            name: file.name,
            size: bytes.length,
            type: file.type || "application/octet-stream",
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
          if (!attachment.success) throw new HttpError(400, "Invalid attachment metadata.");
          return { attachment: attachment.data, bytes };
        }),
      );
      const user = res.locals.user as { id: string; name: string };
      const comment = board.comments.add(
        { ...input.data, cardId: req.params.id, author: { id: user.id, name: user.name } },
        uploads,
      );
      events.changed();
      res.status(201).json(comment);
    },
  );
  return router;
};
