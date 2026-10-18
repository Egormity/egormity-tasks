import { Router } from "express";
import { z } from "zod";
import {
  commandInputSchema,
  stopInputSchema,
  type ChatControls,
  type BackgroundTerminal,
} from "../../api/contracts/commands.js";
import { CodexBridge, BridgeError } from "./bridge.js";
import { defaultControls, listModels, supportsSettings } from "./model-controls.js";
import { readSessionStatus } from "./session-status.js";
import { readTurnActivity } from "../history/activity.js";

export const commandRoutes = (bridge: CodexBridge) => {
  const router = Router();
  router.get("/session-status", async (req, res) => {
    const threadId = z.uuid().optional().parse(req.query.chatId) ?? null;
    res.json(await readSessionStatus(bridge, threadId));
  });
  router.get("/controls", async (_req, res) => {
    res.json(await defaultControls(bridge.rpc, bridge.config.repository, bridge.config.model));
  });
  router.get("/chats/:id/controls", async (req, res) => {
    const native = await bridge.resume(z.uuid().parse(req.params.id));
    const controls: ChatControls = {
      models: await listModels(bridge.rpc),
      model: native.model,
      effort: native.reasoningEffort,
      serviceTier: native.serviceTier,
    };
    res.json(controls);
  });
  router.get("/chats/:id/terminals", async (req, res) => {
    const threadId = z.uuid().parse(req.params.id);
    await bridge.resume(threadId);
    const data: BackgroundTerminal[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: BackgroundTerminal[]; nextCursor: string | null } =
        await bridge.rpc.call("thread/backgroundTerminals/list", {
          threadId,
          cursor,
          limit: 100,
        });
      data.push(
        ...page.data.map(({ processId, command, cwd }) => ({ processId, command, cwd })),
      );
      cursor = page.nextCursor;
    } while (cursor);
    res.json(data);
  });
  router.post("/chats/:id/commands", async (req, res) => {
    const threadId = z.uuid().parse(req.params.id);
    const input = commandInputSchema.parse(req.body);
    await bridge.resume(threadId);
    if (input.command === "compact") {
      await bridge.rpc.call("thread/compact/start", { threadId });
    } else {
      if (!(await supportsSettings(bridge.rpc, input)))
        throw new BridgeError(
          400,
          "These model settings are not available for your Codex account.",
        );
      await bridge.rpc.call("thread/settings/update", {
        threadId,
        model: input.model,
        effort: input.effort,
        serviceTier: input.serviceTier,
      });
    }
    res.sendStatus(202);
  });
  router.post("/chats/:id/stop", async (req, res) => {
    const threadId = z.uuid().parse(req.params.id);
    const input = stopInputSchema.parse(req.body);
    await bridge.resume(threadId);
    if (input.target === "turn") {
      const turn = await readTurnActivity(bridge, threadId);
      if (turn?.status === "inProgress")
        await bridge.rpc.call("turn/interrupt", { threadId, turnId: turn.id });
    } else {
      await bridge.rpc.call(
        input.processId
          ? "thread/backgroundTerminals/terminate"
          : "thread/backgroundTerminals/clean",
        { threadId, ...(input.processId ? { processId: input.processId } : {}) },
      );
    }
    res.sendStatus(202);
  });
  return router;
};
