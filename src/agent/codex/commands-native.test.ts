import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { parseInternalTasksAgentEnvironment } from "../config.js";
import { spawnCodex, stopProcess } from "./process.js";
import { CodexRpc } from "./rpc.js";
import { createWorker } from "../app.js";
import type { Thread } from "../../api/contracts/agent.js";
import type { ChatControls } from "../../api/contracts/commands.js";
import { readExternalTurns } from "../history/native-activity.js";

it.skipIf(!process.env.TEST_NATIVE_CODEX)(
  "controls the same native daemon thread, steers during a turn and disconnects without stopping CLI work",
  async () => {
    const pending: ServerResponse[] = [];
    const model = createServer((request, response) => {
      request.resume();
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.flushHeaders();
      pending.push(response);
    });
    await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
    const address = model.address();
    if (!address || typeof address === "string") throw Error("Address");
    const root = await mkdtemp(join(tmpdir(), "native-commands-"));
    const config = parseInternalTasksAgentEnvironment({
      OPERATIONS_AGENT_CODEX_HOME: join(root, "codex"),
      OPERATIONS_AGENT_REPOSITORY: root,
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
    });
    const socket = join(config.codexHome, "app-server-control/app-server-control.sock");
    await mkdir(join(config.codexHome, "app-server-control"), { recursive: true });
    await writeFile(
      join(config.codexHome, "config.toml"),
      `model = "gpt-5.1-codex-mini"
model_provider = "fixture"
model_reasoning_effort = "high"
service_tier = "fast"
[model_providers.fixture]
name = "Fixture"
base_url = "http://127.0.0.1:${address.port}"
wire_api = "responses"
requires_openai_auth = false
`,
    );
    const daemon = spawnCodex(config, process.env.PATH ?? "", [
      "app-server",
      "--listen",
      `unix://${socket}`,
    ]);
    daemon.stderr.resume();
    daemon.stdout.resume();
    const cli = new CodexRpc(config, process.env.PATH ?? "");
    const worker = createWorker(config, process.env.PATH ?? "");
    const server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const apiAddress = server.address();
    if (!apiAddress || typeof apiAddress === "string") throw Error("Address");
    const call = (path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:${apiAddress.port}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${config.workerToken}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      await expect
        .poll(
          () =>
            stat(socket).then(
              () => true,
              () => false,
            ),
          { timeout: 5000 },
        )
        .toBe(true);
      const defaultsResponse = await call("/controls");
      const defaults = (await defaultsResponse.json()) as ChatControls;
      expect(defaultsResponse.status, JSON.stringify(defaults)).toBe(200);
      expect(defaults).toMatchObject({
        model: "gpt-5.1-codex-mini",
        effort: "high",
        serviceTier: null,
      });
      expect(await worker.bridge.list()).toHaveLength(0);
      const draftStatus = await call("/session-status");
      expect(draftStatus.status).toBe(200);
      expect(await draftStatus.json()).toMatchObject({
        threadId: null,
        state: "ready",
        model: defaults.model,
        effort: "high",
        account: null,
        limitsAvailable: false,
      });
      expect(await worker.bridge.list()).toHaveLength(0);
      const { thread } = await cli.call<{ thread: Thread }>("thread/start", { cwd: root });
      await cli.call("thread/name/set", {
        threadId: thread.id,
        name: "Native commands fixture",
      });
      const path = `/chats/${thread.id}`;
      const controlsResponse = await call(`${path}/controls`);
      const controls = (await controlsResponse.json()) as ChatControls;
      expect(controlsResponse.status, JSON.stringify(controls)).toBe(200);
      expect(defaults).toMatchObject({
        model: controls.model,
        effort: controls.effort,
        serviceTier: controls.serviceTier,
      });
      const selectable = controls.models.find(
        (value) => value.supportedReasoningEfforts.length > 0,
      )!;
      const settings = {
        command: "settings",
        model: selectable.model,
        effort: selectable.defaultReasoningEffort,
        serviceTier: selectable.serviceTiers[0]?.id ?? null,
      };
      const saved = await call(`${path}/commands`, settings);
      expect(saved.status, await saved.text()).toBe(202);
      expect(await (await call(`${path}/controls`)).json()).toMatchObject({
        model: settings.model,
        effort: settings.effort,
        serviceTier: settings.serviceTier,
      });
      const firstMessage = await call(`${path}/messages`, {
        requestId: crypto.randomUUID(),
        text: "Keep working",
        attachments: [],
        settings: { ...settings, serviceTier: null },
      });
      expect(firstMessage.status, await firstMessage.text()).toBe(202);
      const turn = (await worker.bridge.read(thread.id)).turns.at(-1)!;
      expect(await (await call(`${path}/controls`)).json()).toMatchObject({
        model: settings.model,
        effort: settings.effort,
        serviceTier: "default",
      });
      await expect.poll(() => pending.length).toBeGreaterThan(0);
      const input = {
        text: "Clarification from web",
        requestId: crypto.randomUUID(),
        attachments: [],
      };
      const steered = await call(`${path}/messages`, input);
      expect(steered.status, await steered.text()).toBe(202);
      expect((await call(`${path}/messages`, input)).status).toBe(202);
      const live = await worker.bridge.read(thread.id);
      expect(live.turns).toHaveLength(1);
      expect(live.turns[0]?.id).toBe(turn.id);
      expect(live.turns[0]?.status).toBe("inProgress");
      const nativeStatus = await call(`/session-status?chatId=${thread.id}`);
      expect(nativeStatus.status).toBe(200);
      expect(await nativeStatus.json()).toMatchObject({
        threadId: thread.id,
        state: "working",
        model: settings.model,
        effort: settings.effort,
        serviceTier: "default",
      });
      expect((await call(`${path}/terminals`)).status).toBe(200);
      expect((await call(`${path}/stop`, { target: "terminals" })).status).toBe(202);
      expect((await call(`${path}/stop`, { target: "turn" })).status).toBe(202);
      await expect
        .poll(async () => (await worker.bridge.read(thread.id)).turns.at(-1)?.status)
        .toBe("interrupted");
      // Reproduce the incident: a loaded idle thread still holds its writer lock,
      // while persisted history retains an unfinished turn from before recovery.
      const history = new DatabaseSync(join(config.codexHome, "thread_history_1.sqlite"));
      try {
        history
          .prepare(
            "UPDATE thread_turns SET status = 'inProgress' WHERE thread_id = ? AND turn_id = ?",
          )
          .run(thread.id, turn.id);
        expect(await readExternalTurns(config.codexHome, null)).toContainEqual({
          threadId: thread.id,
          turnId: turn.id,
        });
        expect(await (await call("/status")).json()).toMatchObject({
          busy: false,
          externalTurns: [],
          canStop: false,
        });
        expect(await (await call(`/activity/${thread.id}`)).json()).toMatchObject({
          id: turn.id,
          status: "interrupted",
        });
        const snapshot = await (await call(`/snapshot?chatId=${thread.id}`)).json();
        expect(snapshot.detail.status.type).toBe("idle");
        expect(snapshot.detail.turns.at(-1).status).toBe("interrupted");
        expect((await call(`${path}/stop`, { target: "turn" })).status).toBe(202);
      } finally {
        history
          .prepare(
            "UPDATE thread_turns SET status = 'interrupted' WHERE thread_id = ? AND turn_id = ?",
          )
          .run(thread.id, turn.id);
        history.close();
      }
      const compact = await call(`${path}/commands`, { command: "compact" });
      expect(compact.status, await compact.text()).toBe(202);
      await expect
        .poll(async () => (await worker.bridge.read(thread.id)).turns.at(-1)?.status)
        .toBe("inProgress");
      await worker.close();
      const after = await cli.call<{ thread: Thread }>("thread/read", {
        threadId: thread.id,
        includeTurns: true,
      });
      expect(after.thread.turns.at(-1)?.status).toBe("inProgress");
      expect(daemon.exitCode).toBeNull();
      await cli.call("turn/interrupt", {
        threadId: thread.id,
        turnId: after.thread.turns.at(-1)!.id,
      });
    } finally {
      await worker.close();
      await cli.close();
      stopProcess(daemon);
      await new Promise<void>((resolve) => {
        if (daemon.exitCode !== null || daemon.signalCode !== null) resolve();
        else daemon.once("close", () => resolve());
      });
      for (const response of pending) response.destroy();
      model.closeAllConnections();
      server.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => model.close(() => resolve())),
        new Promise<void>((resolve) => server.close(() => resolve())),
      ]);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  },
  25000,
);
