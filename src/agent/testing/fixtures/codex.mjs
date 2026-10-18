#!/usr/bin/env node
import { createInterface } from "node:readline";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

if (process.argv[2] === "login") process.exit(0);
mkdirSync(process.env.CODEX_HOME, { recursive: true });
const path = join(process.env.CODEX_HOME, "fixture-threads.json");
const threads = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const persist = () => writeFileSync(path, JSON.stringify(threads));
const instructionsPath = join(process.env.CODEX_HOME, "fixture-instructions.json");
const write = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const event = (method, params) => write({ method, params });
let active;
const finish = (status) => {
  if (!active) return;
  const { thread, turn } = active;
  thread.status = { type: "idle" };
  turn.status = status;
  turn.completedAt = Date.now() / 1000;
  event("turn/completed", { threadId: thread.id, turn });
  persist();
  active = null;
};
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  const p = message.params ?? {};
  if (message.method === "thread/start" || message.method === "thread/resume")
    if (p.developerInstructions) writeFileSync(instructionsPath, JSON.stringify(p));
  if (message.method === "thread/inject_items")
    writeFileSync(instructionsPath, JSON.stringify(p));
  if (!message.method) {
    if (active?.elicitation) {
      const result = message.result;
      if (
        message.id !== 0 ||
        !["accept", "decline", "cancel"].includes(result?.action) ||
        result._meta !== null ||
        (result.action === "accept"
          ? JSON.stringify(result.content) !== "{}"
          : result.content !== null)
      )
        throw Error("Invalid MCP elicitation response");
      writeFileSync(
        join(process.env.CODEX_HOME, "fixture-response.json"),
        JSON.stringify(message),
      );
    }
    finish("completed");
    return;
  }
  if (message.method === "initialized") return;
  let result = {};
  if (message.method === "account/read")
    result = {
      account: { type: "chatgpt", planType: "pro", email: "private@example.test" },
      requiresOpenaiAuth: true,
    };
  if (message.method === "account/rateLimits/read")
    result = {
      rateLimits: {
        limitId: "codex",
        limitName: "Codex",
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1900000000,
        },
        secondary: null,
      },
      rateLimitsByLimitId: null,
    };
  if (message.method === "config/read")
    result = {
      config: { model: "fixture", model_reasoning_effort: "medium", service_tier: null },
    };
  if (message.method === "thread/start") {
    const id = randomUUID();
    const thread = {
      id,
      cwd: p.cwd,
      name: null,
      preview: "",
      createdAt: Date.now() / 1000,
      updatedAt: Date.now() / 1000,
      status: { type: "idle" },
      historyMode: "paginated",
      turns: [],
    };
    threads[id] = thread;
    result = { thread };
    persist();
  }
  if (message.method === "thread/name/set") {
    threads[p.threadId].name = p.name;
    persist();
    event("thread/name/updated", { threadId: p.threadId, threadName: p.name });
  }
  if (message.method === "thread/list")
    result = {
      data: Object.values(threads).map((thread) => ({ ...thread, turns: [] })),
      nextCursor: null,
    };
  if (message.method === "thread/loaded/list")
    result = { data: Object.keys(threads), nextCursor: null };
  if (message.method === "thread/read" || message.method === "thread/resume")
    result = {
      model: threads[p.threadId]?.model ?? "fixture",
      reasoningEffort: threads[p.threadId]?.effort ?? "medium",
      serviceTier: threads[p.threadId]?.serviceTier ?? null,
      thread: {
        ...threads[p.threadId],
        turns: p.includeTurns ? threads[p.threadId].turns : [],
      },
    };
  if (message.method === "model/list")
    result = {
      data: [
        {
          id: "fixture",
          model: "fixture",
          displayName: "Fixture",
          supportedReasoningEfforts: [
            { reasoningEffort: "medium" },
            { reasoningEffort: "high" },
          ],
          defaultReasoningEffort: "medium",
          serviceTiers: [{ id: "priority", name: "Fast" }],
        },
      ],
      nextCursor: null,
    };
  if (message.method === "thread/settings/update") {
    Object.assign(threads[p.threadId], p);
    persist();
  }
  if (message.method === "thread/backgroundTerminals/list")
    result = {
      data: [{ processId: "p1", command: "sleep 600", cwd: threads[p.threadId].cwd }],
      nextCursor: null,
    };
  if (
    message.method.startsWith("thread/backgroundTerminals/") ||
    message.method === "thread/compact/start"
  )
    writeFileSync(
      join(process.env.CODEX_HOME, "fixture-command.json"),
      JSON.stringify(message),
    );
  if (message.method === "turn/steer") {
    const turn = threads[p.threadId].turns.find(
      (value) => value.id === p.expectedTurnId && value.status === "inProgress",
    );
    if (!turn) {
      write({ id: message.id, error: { message: "Active turn changed" } });
      return;
    }
    const item = {
      id: randomUUID(),
      type: "userMessage",
      clientId: p.clientUserMessageId,
      content: p.input,
    };
    turn.items.push(item);
    persist();
    event("item/completed", { threadId: p.threadId, turnId: turn.id, item });
    result = { turnId: turn.id };
  }
  if (message.method === "thread/turns/list") {
    const turns = [...threads[p.threadId].turns];
    result = { data: p.sortDirection === "desc" ? turns.reverse() : turns, nextCursor: null };
  }
  if (message.method === "turn/start") {
    const thread = threads[p.threadId];
    thread.status = { type: "active", activeFlags: [] };
    const turn = {
      id: randomUUID(),
      status: "inProgress",
      completedAt: null,
      error: null,
      items: [
        {
          id: randomUUID(),
          type: "userMessage",
          clientId: p.clientUserMessageId,
          content: p.input,
        },
      ],
    };
    thread.turns.push(turn);
    active = { thread, turn };
    result = { turn };
    persist();
    event("turn/started", { threadId: thread.id, turn });
    const command = {
      id: randomUUID(),
      type: "commandExecution",
      command: "printf fixture",
      status: "inProgress",
      aggregatedOutput: "",
      exitCode: null,
    };
    turn.items.push(command);
    event("item/started", { threadId: thread.id, turnId: turn.id, item: command });
    command.aggregatedOutput = "fixture output";
    event("item/commandExecution/outputDelta", {
      threadId: thread.id,
      turnId: turn.id,
      itemId: command.id,
      delta: command.aggregatedOutput,
    });
    const text = p.input[0]?.text;
    if (text === "mcp-approval") {
      active.elicitation = true;
      write({
        id: 0,
        method: "mcpServer/elicitation/request",
        params: {
          threadId: thread.id,
          turnId: turn.id,
          mode: "form",
          serverName: "playwright",
          message: "Open the task page?",
          requestedSchema: { type: "object", properties: {} },
          _meta: null,
        },
      });
    } else if (text === "approval")
      write({
        id: "approval-1",
        method: "item/commandExecution/requestApproval",
        params: { threadId: thread.id, turnId: turn.id, command: command.command },
      });
    else if (text !== "wait") setTimeout(() => finish("completed"), 30);
  }
  if (message.method === "turn/interrupt") finish("interrupted");
  write({ id: message.id, result });
});
