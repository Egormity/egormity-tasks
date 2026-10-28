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
import { boardColumnSchema, boardDividerInputSchema } from "../contracts/board-columns.js";

import { HttpError } from "../auth/auth.js";
import type { BoardStore } from "./board-store.js";
import type { BoardEvents } from "./board-events.js";
import { commentRoutes } from "./comments/comment-routes.js";

export const boardRoutes = (store: BoardStore, events: BoardEvents) => {
  const router = Router();
  router.use(commentRoutes(store, events));
  const actor = (response: Response) => (response.locals.user as { username: string }).username;
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
  const columnInputSchema = z
    .object({
      label: z.string().trim().min(1).max(80),
      accent: boardColumnSchema.shape.accent,
    })
    .strict();
  router.get("/events", events.subscribe);
  router.get("/", async (_request, response) =>
    response.json({ ...(await store.snapshot()), version: events.version }),
  );
  router.post("/columns", async (request, response) => {
    const input = parse(columnInputSchema, request.body);
    response.status(201).json(changed(await store.layout.createColumn(input)));
  });
  router.post("/columns/order", async (request, response) => {
    const { ids } = parse(
      z.object({ ids: z.array(z.string().min(1).max(160)) }).strict(),
      request.body,
    );
    response.json(changed(await store.layout.reorderColumns(ids)));
  });
  router.post("/columns/:id", async (request, response) => {
    const input = parse(columnInputSchema, request.body);
    response.json(changed(await store.layout.updateColumn(request.params.id, input)));
  });
  router.post("/columns/:id/remove", async (request, response) =>
    response.json(changed(await store.layout.deleteColumn(request.params.id))),
  );
  router.post("/dividers", async (request, response) =>
    response
      .status(201)
      .json(
        changed(await store.layout.addDivider(parse(boardDividerInputSchema, request.body))),
      ),
  );
  router.post("/dividers/:id", async (request, response) => {
    const { title } = parse(
      boardDividerInputSchema.pick({ title: true }).strict(),
      request.body,
    );
    response.json(changed(await store.layout.updateDivider(request.params.id, title)));
  });
  router.post("/dividers/:id/remove", async (request, response) =>
    response.json(changed(await store.layout.deleteDivider(request.params.id))),
  );
  router.post("/cards", async (request, response) =>
    response
      .status(201)
      .json(changed(await store.create(parse(taskInputSchema, request.body), actor(response)))),
  );
  router.post("/cards/:id", async (request, response) =>
    response.json(
      changed(
        await store.update(
          request.params.id,
          parse(taskUpdateSchema, request.body),
          actor(response),
        ),
      ),
    ),
  );
  router.get("/cards/:id/events", async (request, response) =>
    response.json(await store.events(request.params.id)),
  );
  router.post("/tags", async (request, response) =>
    response
      .status(201)
      .json(changed(await store.saveTag(parse(tagInputSchema, request.body)))),
  );
  router.post("/tags/:id", async (request, response) => {
    if (!(await store.tags()).some((tag) => tag.id === request.params.id))
      throw new HttpError(404, "Tag not found.");
    response.json(
      changed(await store.saveTag(parse(tagInputSchema, request.body), request.params.id)),
    );
  });
  router.post("/tags/:id/remove", async (request, response) =>
    response.json(changed(await store.deleteTag(request.params.id, actor(response)))),
  );
  router.post(
    "/cards/:id/attachments",
    raw({ type: "application/octet-stream", limit: policy.attachmentMaxBytes }),
    async (request, response) => {
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
            await store.attach(
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
  router.get("/cards/:id/attachments/:attachmentId", async (request, response) => {
    const [card, comments] = await Promise.all([
      store.get(request.params.id),
      store.comments.list(request.params.id),
    ]);
    const attachment = [
      ...card.attachments,
      ...comments.flatMap((comment) => comment.attachments),
    ].find((item) => item.id === request.params.attachmentId);
    const file = attachment?.sha256 ? await store.getFile(attachment.sha256) : undefined;
    if (!attachment || !file) throw new HttpError(404, "Attachment file is unavailable.");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name).replace(/'/gu, "%27")}`,
    );
    response.type("application/octet-stream").send(file);
  });
  router.post("/cards/:id/attachments/:attachmentId/remove", async (request, response) => {
    const { revision } = parse(
      z.object({ revision: z.number().int().positive() }).strict(),
      request.body,
    );
    response.json(
      changed(
        await store.detach(
          request.params.id,
          revision,
          request.params.attachmentId,
          actor(response),
        ),
      ),
    );
  });
  return router;
};
