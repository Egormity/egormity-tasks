import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { RpcMessage, Snapshot, Thread, Turn } from "../../api/contracts/agent.js";
import { createWorker } from "../app.js";
import { parseInternalTasksAgentEnvironment } from "../config.js";
import { CodexRpc } from "../codex/rpc.js";

it.skipIf(!process.env.TEST_NATIVE_CODEX)(
  "refreshes persisted turns from another running native process over HTTP/SSE without resuming it",
  async () => {
    let pending: ServerResponse | undefined;
    const model = createServer((request, response) => {
      request.resume();
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.flushHeaders();
      pending = response;
    });
    await new Promise<void>((resolve) => model.listen(0, "127.0.0.1", resolve));
    const modelAddress = model.address();
    if (!modelAddress || typeof modelAddress === "string") throw Error("Address");
    const root = await mkdtemp(join(tmpdir(), "native-external-history-"));
    const config = parseInternalTasksAgentEnvironment({
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
      OPERATIONS_AGENT_CODEX_HOME: join(root, "codex"),
      OPERATIONS_AGENT_REPOSITORY: root,
    });
    await mkdir(config.codexHome);
    await writeFile(
      join(config.codexHome, "config.toml"),
      `model = "gpt-5.1-codex-mini"
model_provider = "fixture"
[model_providers.fixture]
name = "Fixture"
base_url = "http://127.0.0.1:${modelAddress.port}"
wire_api = "responses"
requires_openai_auth = false
`,
    );
    const external = new CodexRpc(config, process.env.PATH ?? "");
    const worker = createWorker(config, process.env.PATH ?? "");
    const server = worker.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Address");
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { Authorization: `Bearer ${config.workerToken}` };
    const abort = new AbortController();
    let consume: Promise<void> | undefined;
    let streamError: unknown;
    try {
      const { thread } = await external.call<{ thread: Thread }>("thread/start", { cwd: root });
      await external.call("thread/name/set", { threadId: thread.id, name: "External CLI" });
      const snapshots: Snapshot[] = [];
      const methods: string[] = [];
      const refresh = async () => {
        const since = snapshots.at(-1)?.detail?.turns.at(-1)?.id;
        const response = await fetch(
          `${base}/snapshot?chatId=${thread.id}${since ? `&sinceTurnId=${since}` : ""}`,
          {
            headers,
            signal: abort.signal,
          },
        );
        const body: unknown = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(200);
        snapshots.push(body as Snapshot);
      };
      const response = await fetch(base + "/events", { headers, signal: abort.signal });
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      consume = (async () => {
        let buffer = "";
        const decoder = new TextDecoder();
        for await (const chunk of response.body!) {
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!frame.startsWith("data: ")) continue;
            const event = JSON.parse(frame.slice(6)) as RpcMessage;
            methods.push(event.method);
            if (["bridge/connected", "bridge/historyChanged"].includes(event.method))
              await refresh();
          }
        }
      })().catch((error: unknown) => {
        if (!abort.signal.aborted) streamError = error;
      });
      await expect.poll(() => snapshots.length).toBeGreaterThan(0);
      expect(snapshots.at(-1)?.detail?.turns).toHaveLength(0);

      // This turn belongs to a different Codex process, never the web bridge.
      const { turn } = await external.call<{ turn: Turn }>("turn/start", {
        threadId: thread.id,
        input: [{ type: "text", text: "EXTERNAL_CLI_MARKER", text_elements: [] }],
      });
      await expect.poll(() => pending, { timeout: 5000 }).toBeDefined();
      await expect
        .poll(() => snapshots.at(-1)?.detail?.turns.at(-1)?.id, { timeout: 5000 })
        .toBe(turn.id);
      expect(JSON.stringify(snapshots.at(-1)?.detail)).toContain("EXTERNAL_CLI_MARKER");
      expect(snapshots.at(-1)?.detail?.turns.at(-1)?.status).toBe("inProgress");
      expect(snapshots.at(-1)?.status).toMatchObject({
        busy: true,
        canStop: false,
        externalTurns: [{ threadId: thread.id, turnId: turn.id }],
      });
      // The owning process is still working and is untouched by this synchronization.
      const live = await external.call<{ thread: Thread }>("thread/read", {
        threadId: thread.id,
        includeTurns: true,
      });
      expect(live.thread.turns.at(-1)?.status).toBe("inProgress");
      expect(worker.bridge.busy).toBe(false);
      expect(methods).not.toContain("turn/started");
      const rejected = await fetch(`${base}/chats/${thread.id}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), text: "Do not run" }),
      });
      expect(rejected.status).toBe(409);

      pending!.write(
        `data: ${JSON.stringify({
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: "msg_external_progress",
            type: "message",
            role: "assistant",
            phase: "commentary",
            content: [{ type: "output_text", text: "EXTERNAL_PROGRESS_MARKER" }],
          },
        })}\n\n`,
      );
      await expect
        .poll(() => JSON.stringify(snapshots.at(-1)?.detail), { timeout: 5000 })
        .toContain("EXTERNAL_PROGRESS_MARKER");

      const changesBeforeCompletion = methods.length;
      pending!.end(
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_fixture",
            status: "completed",
            output: [],
            usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
          },
        })}\n\n`,
      );
      await expect
        .poll(() => snapshots.at(-1)?.detail?.turns.at(-1)?.status, { timeout: 5000 })
        .toBe("completed");
      expect(methods.length).toBeGreaterThan(changesBeforeCompletion);
      expect(methods).toContain("bridge/historyChanged");
      expect(snapshots.at(-1)?.status).toMatchObject({ busy: false, externalTurns: [] });
      expect(streamError).toBeUndefined();
      // Native reads alone must not keep generating new persistence invalidations.
      const count = methods.length;
      await refresh();
      await new Promise((resolve) => setTimeout(resolve, 2200));
      expect(methods.length).toBeLessThanOrEqual(count + 1);
    } finally {
      abort.abort();
      await consume;
      await external.close();
      await worker.close();
      server.closeAllConnections();
      model.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => server.close(() => resolve())),
        new Promise<void>((resolve) => model.close(() => resolve())),
      ]);
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  30_000,
);
