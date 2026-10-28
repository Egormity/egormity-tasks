import { type InternalTasksEnvironment, internalTasksPolicy as policy } from "./config.js";
import express, { type ErrorRequestHandler } from "express";

import { UserAuthentication, HttpError, localAdminUser } from "./auth/auth.js";
import { UserStore } from "./auth/user-store.js";
import { userRoutes } from "./auth/user-routes.js";
import { boardRoutes } from "./board/board-routes.js";
import { BoardEvents } from "./board/board-events.js";
import { BoardStore } from "./board/board-store.js";

import { PostgresDatabase } from "./database/database.js";

export const createApplication = async (
  config: InternalTasksEnvironment,
  store: PostgresDatabase,
) => {
  await store.migrate();
  const users = new UserStore(store);
  await users.ensureBootstrapAdmin(
    localAdminUser(config),
    config.adminPasswordHash,
    config.adminName,
  );
  const board = new BoardStore(store);
  await board.initialize();
  const app = express();
  const authentication = new UserAuthentication(config, users);
  const boardEvents = new BoardEvents();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.get("/health", async (_request, response) => {
    await store.healthCheck();
    response.json({ status: "ok" });
  });
  const api = express.Router();
  api.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  api.use((request, _response, next) => {
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.origin !== new URL(config.publicUrl).origin
    ) {
      next(new HttpError(403, "This request must come from the operations application."));
      return;
    }
    next();
  });
  api.use(express.json({ limit: policy.requestBodyLimit }));
  api.post("/login", authentication.login);
  api.post("/logout", authentication.logout);
  api.use(authentication.requireAuthenticated);
  api.get("/session", (_request, response) => response.json(response.locals.user));
  api.use("/users", authentication.requireAdmin, userRoutes(users));
  api.use("/board", boardRoutes(board, boardEvents));
  api.use((_request, _response, next) => next(new HttpError(404, "Endpoint not found.")));
  app.use(policy.apiPath, api);
  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    void _next;
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: "Invalid request body." });
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response.status(413).json({ error: "The file or request is too large." });
      return;
    }
    console.error(
      "Operations request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    response.status(500).json({ error: "The request could not be completed." });
  };
  app.use(errors);
  return { app, close: () => Promise.resolve(boardEvents.close()) };
};
