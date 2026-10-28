import { Router } from "express";
import { z } from "zod";

import {
  createUserRequestSchema,
  updateUserRequestSchema,
  type User,
} from "../contracts/auth.js";
import { HttpError } from "../http-error.js";
import { UserStore } from "./user-store.js";

export const userRoutes = (users: UserStore) => {
  const router = Router();
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new HttpError(400, "Invalid user data.");
    return result.data;
  };

  router.get("/", async (_request, response) => response.json(await users.list()));
  router.post("/", async (request, response) =>
    response.status(201).json(await users.create(parse(createUserRequestSchema, request.body))),
  );
  router.post("/:id/remove", async (request, response) => {
    const actor = response.locals.user as User;
    response.json(await users.remove(request.params.id, actor.id));
  });
  router.post("/:id", async (request, response) => {
    const actor = response.locals.user as User;
    response.json(
      await users.update(
        request.params.id,
        actor.id,
        parse(updateUserRequestSchema, request.body),
      ),
    );
  });
  return router;
};
