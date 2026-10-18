import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { CodexBridge } from "../codex/bridge.js";
import { parseInternalTasksAgentEnvironment } from "../config.js";
import type { RpcMessage } from "../../api/contracts/agent.js";
import type { ModelSettings } from "../../api/contracts/commands.js";
import { defaultControls } from "../codex/model-controls.js";
import type { BoardTaskContext } from "../../api/contracts/task-context.js";
import { taskSchema } from "../../api/contracts/board.js";
import { readTurnActivity } from "../history/activity.js";
import { readSessionStatus } from "../codex/session-status.js";

it.skipIf(!process.env.TEST_NATIVE_CODEX)(
  "updates instructions in an existing native thread, including after bridge restart",
  async () => {
    const requests: string[] = [];
    // Capture the real CLI's Responses requests locally; no account or external model is used.
    const server = createServer((request, response) => {
      void (async () => {
        let body = "";
        for await (const part of request) body += String(part);
        requests.push(body);
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({
            type: "response.completed",
            response: {
              id: `resp_${requests.length}`,
              status: "completed",
              output: [],
              usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
            },
          })}\n\n`,
        );
      })().catch(() => {
        response.destroy();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Address");
    const root = await mkdtemp(join(tmpdir(), "native-agent-instructions-"));
    const config = parseInternalTasksAgentEnvironment({
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
      OPERATIONS_AGENT_CODEX_HOME: join(root, "codex"),
      OPERATIONS_AGENT_REPOSITORY: join(root, "repository"),
      OPERATIONS_AGENT_WORKTREES: join(root, "worktrees"),
      OPERATIONS_AGENT_INSTRUCTIONS_FILE: join(root, "instructions.md"),
      OPERATIONS_AGENT_SSH_MAIN_HOST: "main.test",
      OPERATIONS_AGENT_SSH_MAIN_USER: "admin",
      OPERATIONS_AGENT_SSH_MAIN_DIRECTORY: "/srv/app",
      OPERATIONS_AGENT_SSH_MAIN_PASSWORD: "native-fixture-password",
    });
    let bridge = new CodexBridge(config, process.env.PATH ?? "");
    const send = async (
      id: string,
      settings?: ModelSettings,
      taskContext?: BoardTaskContext,
    ) => {
      await bridge.send(
        id,
        {
          text: "Respond OK",
          requestId: randomUUID(),
          attachments: [],
          ...(settings ? { settings } : {}),
        },
        taskContext,
      );
      await expect.poll(() => bridge.busy, { timeout: 10_000 }).toBe(false);
      expect((await bridge.read(id)).turns.at(-1)?.status).toBe("completed");
      const latest = await readTurnActivity(bridge, id);
      expect(latest).toMatchObject({
        status: "completed",
        completedAt: expect.any(Number) as number,
      });
      expect(await readTurnActivity(bridge, id, latest!.id)).toEqual(latest);
    };
    try {
      await mkdir(config.codexHome);
      await mkdir(config.repository);
      await writeFile(join(config.codexHome, "AGENTS.md"), "GLOBAL_INSTRUCTION_MARKER");
      await writeFile(join(config.repository, "AGENTS.md"), "REPOSITORY_INSTRUCTION_MARKER");
      await writeFile(
        join(config.codexHome, "config.toml"),
        `
model = "gpt-5.1-codex-mini"
model_provider = "fixture"
[model_providers.fixture]
name = "Fixture"
base_url = "http://127.0.0.1:${address.port}"
wire_api = "responses"
requires_openai_auth = false
`,
      );
      const execute = promisify(execFile);
      await execute("git", ["init", "-q", config.repository]);
      await execute("git", ["-C", config.repository, "add", "AGENTS.md"]);
      await execute("git", [
        "-C",
        config.repository,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "commit",
        "--allow-empty",
        "-m",
        "Fixture",
      ]);
      await writeFile(config.instructionsFile, "INITIAL_INSTRUCTION_MARKER");
      const taskContext: BoardTaskContext = {
        task: taskSchema.parse({
          id: "assessment-task",
          title: "Assess task",
          description: "TASK_DATA_MARKER",
          priority: "medium",
          status: "backlog",
          tagIds: [],
          order: 0,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attachments: [],
          revision: 1,
        }),
        tags: [],
        url: "https://tasks.example/tasks?task=assessment-task",
      };
      const controls = await defaultControls(bridge.rpc, config.repository);
      const model = controls.models[0]!;
      const settings = {
        model: model.model,
        effort: model.defaultReasoningEffort,
        serviceTier: null,
      };
      const thread = await bridge.create();
      // No rename/inject workaround to materialize the empty thread before the first input.
      expect((await bridge.read(thread.id)).turns).toEqual([]);
      await bridge.files.save(thread.id, "context.txt", Buffer.from("Task file"));
      await send(thread.id, settings);
      expect(requests[0]).toContain("INITIAL_INSTRUCTION_MARKER");
      expect(JSON.parse(requests[0]!) as unknown).toMatchObject({ model: settings.model });

      await writeFile(config.instructionsFile, "UPDATED_INSTRUCTION_MARKER");
      await send(thread.id);
      expect(requests[1]).toContain("UPDATED_INSTRUCTION_MARKER");

      await send(thread.id, undefined, taskContext);
      expect(requests[2]).toContain("UPDATED_INSTRUCTION_MARKER");
      expect(requests[2]).toContain("TASK_DATA_MARKER");

      await bridge.close();
      bridge = new CodexBridge(config, process.env.PATH ?? "");
      const resumedStatus = await readSessionStatus(bridge, thread.id);
      expect(resumedStatus).toMatchObject({
        threadId: thread.id,
        state: "ready",
        context: {
          tokens: 1,
          totalTokens: 3,
        },
      });
      await writeFile(config.instructionsFile, "RESTARTED_INSTRUCTION_MARKER");
      const updates: RpcMessage[] = [];
      bridge.rpc.on("notification", (event: RpcMessage) => updates.push(event));
      await send(thread.id, undefined, taskContext);
      expect(requests[3]).toContain("RESTARTED_INSTRUCTION_MARKER");
      expect((await bridge.read(thread.id)).turns).toHaveLength(4);
      const boardThread = await bridge.create();
      await send(boardThread.id, undefined, taskContext);
      expect(requests[4]).toContain("RESTARTED_INSTRUCTION_MARKER");
      expect(requests[4]).toContain("TASK_DATA_MARKER");
      expect(requests[4]).not.toContain("INITIAL_INSTRUCTION_MARKER");
      expect(requests[4]).not.toContain("UPDATED_INSTRUCTION_MARKER");
      expect(requests.every((body) => body.includes("GLOBAL_INSTRUCTION_MARKER"))).toBe(true);
      expect(requests.every((body) => body.includes("REPOSITORY_INSTRUCTION_MARKER"))).toBe(
        true,
      );
      expect(requests.every((body) => body.includes("admin@main.test"))).toBe(true);
      expect(requests.join("\n")).not.toContain("native-fixture-password");
      expect(JSON.stringify(updates)).not.toContain("native-fixture-password");
    } finally {
      await bridge.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
  30_000,
);
