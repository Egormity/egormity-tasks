import { internalTasksPolicy as policy } from "../config.js";
import { type Response, Router, raw } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import {
  attachmentSchema,
  tagInputSchema,
  taskInputSchema,
  taskUpdateSchema,
} from "../contracts/board.js";

import { HttpError } from "../auth/auth.js";
import type { BoardStore } from "./board-store.js";
import type { BoardEvents } from "./board-events.js";
import { commentRoutes } from "./comments/comment-routes.js";

export const boardRoutes = (store: BoardStore, events: BoardEvents) => {
  const router = Router();
  router.use(commentRoutes(store, events));
  const actor = (response: Response) => (response.locals.user as { name: string }).name;
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new HttpError(400, "Invalid task data.");
    return result.data;
  };
  const changed = <T>(result: T): T => {
    // Called after a committed write, even if the HTTP client disconnects before its reply.
    events.changed();
    return result;
  };
  router.get("/events", events.subscribe);
  router.get("/", (_request, response) =>
    response.json({ ...store.snapshot(), version: events.version }),
  );
  router.post("/cards", (request, response) =>
    response
      .status(201)
      .json(changed(store.create(parse(taskInputSchema, request.body), actor(response)))),
  );
  router.post("/cards/:id", (request, response) =>
    response.json(
      changed(
        store.update(request.params.id, parse(taskUpdateSchema, request.body), actor(response)),
      ),
    ),
  );
  router.get("/cards/:id/events", (request, response) =>
    response.json(store.events(request.params.id)),
  );
  router.post("/tags", (request, response) =>
    response.status(201).json(changed(store.saveTag(parse(tagInputSchema, request.body)))),
  );
  router.post("/tags/:id", (request, response) => {
    if (!store.tags().some((tag) => tag.id === request.params.id))
      throw new HttpError(404, "Tag not found.");
    response.json(
      changed(store.saveTag(parse(tagInputSchema, request.body), request.params.id)),
    );
  });
  router.post("/tags/:id/remove", (request, response) =>
    response.json(changed(store.deleteTag(request.params.id, actor(response)))),
  );
  router.post(
    "/cards/:id/attachments",
    raw({ type: "application/octet-stream", limit: policy.attachmentMaxBytes }),
    (request, response) => {
      const revision = parse(
        z.coerce.number().int().positive(),
        request.headers["x-task-revision"],
      );
      if (!Buffer.isBuffer(request.body) || !request.body.length)
        throw new HttpError(400, "Choose a non-empty file.");
      let name: string;
      try {
        name = decodeURIComponent(String(request.headers["x-file-name"] ?? ""));
      } catch {
        throw new HttpError(400, "Invalid file name.");
      }
      const attachment = parse(attachmentSchema, {
        id: request.headers["x-attachment-id"] ?? randomUUID(),
        name,
        size: request.body.length,
        type: request.headers["x-file-type"] ?? "application/octet-stream",
        sha256: createHash("sha256").update(request.body).digest("hex"),
      });
      response
        .status(201)
        .json(
          changed(
            store.attach(
              request.params.id,
              revision,
              attachment,
              request.body,
              actor(response),
            ),
          ),
        );
    },
  );
  router.get("/cards/:id/attachments/:attachmentId", (request, response) => {
    const attachment = [
      ...store.get(request.params.id).attachments,
      ...store.comments.list(request.params.id).flatMap((comment) => comment.attachments),
    ].find((a) => a.id === request.params.attachmentId);
    const file = attachment?.sha256
      ? store.db.prepare("SELECT bytes FROM task_files WHERE sha256 = ?").get(attachment.sha256)
      : undefined;
    if (!attachment || !file) throw new HttpError(404, "Attachment file is unavailable.");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name).replace(/'/gu, "%27")}`,
    );
    response.type("application/octet-stream").send(Buffer.from(file.bytes as Uint8Array));
  });
  router.post("/cards/:id/attachments/:attachmentId/remove", (request, response) => {
    const { revision } = parse(
      z.object({ revision: z.number().int().positive() }).strict(),
      request.body,
    );
    response.json(
      changed(
        store.detach(request.params.id, revision, request.params.attachmentId, actor(response)),
      ),
    );
  });
  return router;
};
