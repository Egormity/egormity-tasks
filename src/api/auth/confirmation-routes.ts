import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { Confirmations, type ConfirmationOwner } from "./confirmation-store.js";
import {
  confirmationActionSchema,
  confirmationProofSchema,
} from "../contracts/confirmation.js";
import { HttpError, readToken } from "./auth.js";
import type { InternalTasksEnvironment } from "../config.js";
import { WorkConfirmations } from "./work-confirmations.js";

const owner = (req: Request, res: Response): ConfirmationOwner => ({
  ...(res.locals.user as Omit<ConfirmationOwner, "session">),
  session: readToken(req) ?? "",
});
const parseAction = (input: unknown) => {
  const value = confirmationActionSchema.safeParse(input);
  if (!value.success) throw new HttpError(400, "Invalid confirmation request.");
  return value.data;
};

// Exact allowlist prevents encoded paths, trailing-slash aliases and future worker methods
// from bypassing confirmation. Internal worker drain/resume controls are never public.
const segment = "[a-zA-Z0-9-]+";
const reads = new RegExp(
  `^/(status|session-status|snapshot|events|context|controls|chats|chats/${segment}(/(controls|terminals))?|files/${segment})$`,
  "u",
);
const writes = new RegExp(
  `^/(chats|chats/${segment}/(files|name|messages|commands|stop)|stop|codex/login|requests/respond)$`,
  "u",
);

export const confirmationRoutes = (
  config: InternalTasksEnvironment,
  work = new WorkConfirmations(config),
) => {
  const router = Router();
  const confirmations = new Confirmations(config.telegram);
  router.post("/confirmations", async (req, res) => {
    const action = parseAction(req.body);
    const identity = owner(req, res);
    if (action.kind !== "login" && (await work.allowed(identity))) {
      res.json({ confirmed: true });
      return;
    }
    res.status(201).json(await confirmations.create(identity, action));
  });
  router.post("/confirmations/:id/cancel", (req, res) => {
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new HttpError(400, "Invalid confirmation request.");
    confirmations.cancel(owner(req, res), id.data);
    res.sendStatus(204);
  });
  router.use(async (req, res, next) => {
    if (
      !(
        req.method === "GET" || req.method === "HEAD"
          ? reads
          : req.method === "POST"
            ? writes
            : null
      )?.test(req.path)
    )
      throw new HttpError(404, "Endpoint not found.");
    if (req.method !== "POST") {
      next();
      return;
    }
    const body = req.body as Record<string, unknown> | undefined;
    const kind = req.path.endsWith("/messages")
      ? "message"
      : req.path.endsWith("/commands")
        ? "command"
        : req.path === "/requests/respond"
          ? "response"
          : req.path === "/codex/login"
            ? "login"
            : null;
    if (kind) {
      const action = parseAction({
        kind,
        ...(kind === "message" || kind === "command" ? { chatId: req.path.split("/")[2] } : {}),
        input: body,
      });
      const identity = owner(req, res);
      // A supplied code must always be consumed, even when another concurrent call unlocked work.
      if (
        body?.confirmation !== undefined ||
        action.kind === "login" ||
        !(await work.allowed(identity))
      ) {
        const proof = confirmationProofSchema.safeParse(body?.confirmation);
        if (!proof.success)
          throw new HttpError(403, "Confirm this action with a Telegram code.");
        confirmations.consume(identity, action, proof.data);
        if (action.kind !== "login") work.authorize(identity);
      }
      if (action.kind !== "login") {
        const finish = await work.begin(identity, action);
        res.locals.finishConfirmedWork = finish;
        res.once("close", () => {
          void finish(false).catch(() => {});
        });
      }
      req.body = action.input; // Codes are never relayed to Codex or its event stream.
    }
    next();
  });
  return router;
};
