import type { InternalTasksAgentEnvironment } from "./config.js";
import { messageInputSchema, renameInputSchema } from "../api/contracts/agent.js";
import express, { type ErrorRequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CodexAuthentication } from "./codex/auth.js";
import { BridgeError, CodexBridge } from "./codex/bridge.js";
import { readContext } from "./instructions/context.js";
import { uploadMaxBytes } from "./workspace/files.js";
import type { RpcMessage } from "../api/contracts/agent.js";
import { NativeHistoryChanges } from "./history/history-changes.js";
import { applyExternalActivity } from "./history/native-activity.js";
import { commandRoutes } from "./codex/commands.js";
import { readTurnActivity } from "./history/activity.js";
import { boardTaskContextSchema } from "../api/contracts/task-context.js";

export const createWorker = (config: InternalTasksAgentEnvironment, path: string) => {
  const app = express();
  const bridge = new CodexBridge(config, path);
  const authentication = new CodexAuthentication(bridge.rpc);
  const history = new NativeHistoryChanges(config.codexHome);
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use((req, res, next) => {
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (
      !timingSafeEqual(
        digest(req.headers.authorization ?? ""),
        digest(`Bearer ${config.workerToken}`),
      )
    ) {
      res.sendStatus(401);
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const status = async () => {
    const externalTurns = await bridge.externalTurns();
    return {
      ...(await authentication.status()),
      busy: bridge.busy || authentication.loginRunning || externalTurns.length > 0,
      activeChatId: bridge.active?.threadId ?? externalTurns[0]?.threadId ?? null,
      externalTurns,
      canStop: Boolean(bridge.active),
    };
  };
  app.get("/status", async (_req, res) => res.json(await status()));
  // Private main-to-Gateway endpoint. Not exposed by the browser relay allowlist.
  app.get("/activity/:id", async (req, res) => {
    const threadId = z.uuid().parse(req.params.id);
    const turnId = z.string().max(160).optional().parse(req.query.turnId);
    res.json(await readTurnActivity(bridge, threadId, turnId));
  });
  app.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const emit = (event: RpcMessage) => {
      if (res.writableLength > 4 * 1024 * 1024) {
        res.destroy();
        return;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    bridge.rpc.on("notification", emit);
    const unsubscribe = history.subscribe(() =>
      emit({ method: "bridge/historyChanged", params: {} }),
    );
    emit({ method: "bridge/connected", params: {} });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      bridge.rpc.off("notification", emit);
      unsubscribe();
    });
  });
  app.post(
    "/chats/:id/files",
    express.raw({ type: "application/octet-stream", limit: uploadMaxBytes }),
    async (req, res) => {
      await bridge.read(req.params.id);
      if (!Buffer.isBuffer(req.body)) throw new BridgeError(400, "Expected a file.");
      const name = decodeURIComponent(String(req.headers["x-file-name"] ?? "attachment"));
      res.status(201).json(await bridge.files.save(req.params.id, name, req.body));
    },
  );
  app.get("/files/:id", async (req, res) => {
    const file = await bridge.files.get(req.params.id);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Type", file.mime);
    res.setHeader(
      "Content-Disposition",
      `${file.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.sendFile(file.path);
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(commandRoutes(bridge));
  app.get("/snapshot", async (req, res) => {
    const id = typeof req.query.chatId === "string" ? req.query.chatId : null;
    const chats = await bridge.list();
    const sinceTurnId =
      typeof req.query.sinceTurnId === "string" ? req.query.sinceTurnId : undefined;
    const detail = id ? await bridge.readWithCursor(id, sinceTurnId) : null;
    if (detail && !chats.some((thread) => thread.id === id)) chats.unshift(detail.thread);
    const current = await status();
    res.json({
      chats: chats.map((thread) => applyExternalActivity(thread, current.externalTurns)),
      detail: detail ? applyExternalActivity(detail.thread, current.externalTurns) : null,
      cursor: detail?.cursor ?? 0,
      partial: detail?.partial ?? false,
      status: current,
      requests: [...bridge.rpc.requests.values()],
    });
  });
  app.get("/context", async (req, res) => {
    const id = typeof req.query.chatId === "string" ? req.query.chatId : null;
    const native = id ? await bridge.resume(id) : null;
    res.json(await readContext(config, native?.thread, native?.instructionSources));
  });
  app.get("/chats", async (_req, res) => res.json(await bridge.list()));
  app.post("/chats", async (_req, res) => {
    if (authentication.loginRunning) throw new BridgeError(409, "Account login is running.");
    res.status(201).json(await bridge.create());
  });
  app.get("/chats/:id", async (req, res) => res.json(await bridge.read(req.params.id)));
  app.post("/chats/:id/name", async (req, res) => {
    const input = renameInputSchema.parse(req.body);
    await bridge.rename(req.params.id, input.name);
    res.sendStatus(204);
  });
  app.post("/chats/:id/messages", async (req, res) => {
    const input = messageInputSchema.parse(req.body);
    if (authentication.loginRunning) throw new BridgeError(409, "Account login is running.");
    if (!(await authentication.check()))
      throw new BridgeError(503, "Connect your Codex account first.");
    if (authentication.loginRunning) throw new BridgeError(409, "Account login is running.");
    const { taskContext } = z
      .object({ taskContext: boardTaskContextSchema.optional() })
      .parse(req.body);
    await bridge.send(req.params.id, input, taskContext);
    res.sendStatus(202);
  });
  app.post("/requests/respond", (req, res) => {
    const input = z
      .object({ id: z.union([z.string(), z.number()]), result: z.unknown() })
      .parse(req.body);
    bridge.rpc.respond(input.id, input.result);
    res.sendStatus(204);
  });
  app.post("/stop", async (_req, res) => {
    await bridge.stop();
    res.sendStatus(202);
  });
  app.post("/login", async (_req, res) => {
    if ((await status()).busy) throw new BridgeError(409, "The agent is already working.");
    await authentication.start();
    res.sendStatus(202);
  });
  app.post("/drain", (_req, res) => {
    if (bridge.busy || authentication.loginRunning)
      throw new BridgeError(409, "The agent is already working.");
    bridge.accepting = false;
    res.sendStatus(204);
  });
  app.post("/resume", (_req, res) => {
    bridge.accepting = true;
    res.sendStatus(204);
  });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    void _next;
    const statusCode =
      error instanceof BridgeError
        ? error.status
        : error instanceof z.ZodError || error instanceof URIError
          ? 400
          : typeof error === "object" && error && "status" in error && error.status === 413
            ? 413
            : 502;
    res
      .status(statusCode)
      .json({ error: error instanceof Error ? error.message : "Codex request failed." });
  };
  app.use(errors);
  return {
    app,
    bridge,
    close: () => {
      history.close();
      return bridge.close();
    },
  };
};
