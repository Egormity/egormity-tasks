import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { parseInternalTasksAgentEnvironment } from "../config.js";
import type { Thread } from "../../api/contracts/agent.js";
import { CodexRpc } from "./rpc.js";

it.skipIf(!process.env.TEST_NATIVE_CODEX)(
  "uses installed Codex persistence and paginated history without a model request",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "native-codex-"));
    await mkdir(join(root, "codex"));
    await promisify(execFile)("git", ["init", "-q", root]);
    const config = parseInternalTasksAgentEnvironment({
      OPERATIONS_AGENT_WORKER_TOKEN: "x".repeat(32),
      OPERATIONS_AGENT_CODEX_HOME: join(root, "codex"),
      OPERATIONS_AGENT_REPOSITORY: root,
    });
    let rpc = new CodexRpc(config, process.env.PATH ?? "");
    try {
      const { thread } = await rpc.call<{ thread: Thread }>("thread/start", { cwd: root });
      await rpc.call("thread/name/set", { threadId: thread.id, name: "Native title" });
      await rpc.close();
      rpc = new CodexRpc(config, process.env.PATH ?? "");
      const read = await rpc.call<{ thread: Thread }>("thread/read", { threadId: thread.id });
      expect(read.thread.name).toBe("Native title");
      expect(read.thread.path).toContain(config.codexHome);
      expect(
        await rpc.call("thread/turns/list", { threadId: thread.id, itemsView: "full" }),
      ).toMatchObject({ data: [], nextCursor: null });
    } finally {
      await rpc.close();
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  },
);
