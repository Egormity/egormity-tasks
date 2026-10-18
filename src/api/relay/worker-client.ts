import type { InternalTasksEnvironment } from "../config.js";
import type { RequestHandler } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpError } from "../auth/auth.js";
import type { BoardTaskContext } from "../contracts/task-context.js";

/** HTTP relay only. No messages, IDs or Codex events are stored on main. */
export const workerRelay =
  (config: InternalTasksEnvironment): RequestHandler =>
  async (req, res, next) => {
    const abort = new AbortController();
    res.once("close", () => abort.abort());
    // Reopen authenticated SSE periodically so revoked administrator sessions lose access.
    const sessionTimer =
      req.path === "/events" ? setTimeout(() => res.end(), 60_000) : undefined;
    res.once("close", () => clearTimeout(sessionTimer));
    try {
      const url = `${config.workerUrl}${req.url.replace(/^\/codex\/login/u, "/login")}`;
      const headers = new Headers({ Authorization: `Bearer ${config.workerToken}` });
      for (const name of ["content-type", "x-file-name"]) {
        const value = req.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      const raw = req.headers["content-type"]?.startsWith("application/octet-stream");
      const incoming = req.body as Record<string, unknown> | undefined;
      const taskContext = res.locals.boardTaskContext as BoardTaskContext | undefined;
      const payload = taskContext ? { ...incoming, taskContext } : incoming;
      const body = ["GET", "HEAD"].includes(req.method)
        ? undefined
        : raw
          ? req
          : JSON.stringify(payload ?? {});
      const response = await fetch(url, {
        method: req.method,
        headers,
        redirect: "error",
        signal: abort.signal,
        ...(body !== undefined ? { body: body as BodyInit, duplex: "half" } : {}),
      });
      const finish = res.locals.finishConfirmedWork as
        ((success: boolean) => Promise<void>) | undefined;
      // Record the accepted native turn before the client can submit its next action.
      // A failed activity read must not turn an accepted message into a misleading send failure.
      if (finish) await finish(response.ok).catch(() => {});
      res.status(response.status);
      for (const name of [
        "content-type",
        "content-disposition",
        "x-content-type-options",
        "content-security-policy",
        "x-accel-buffering",
      ]) {
        const value = response.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (!response.body) {
        res.end();
        return;
      }
      res.flushHeaders();
      await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        res,
      );
    } catch (error) {
      if (abort.signal.aborted) return;
      if (res.headersSent) res.destroy();
      else next(new HttpError(503, "The Codex worker is unavailable."));
      void error;
    }
  };
