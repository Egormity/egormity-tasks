import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
import { expect, it, vi } from "vitest";
import config from "../../vite.config";

const isFullReload = (payload: unknown) =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  payload.type === "full-reload";

it("keeps chat workspace creation out of Vite reloads while still reloading edited web pages", async () => {
  const root = await mkdtemp(join(tmpdir(), "tasks-vite-watch-"));
  await writeFile(join(root, "index.html"), "<html><body>Chat</body></html>");
  const server = await createServer({
    ...config,
    configFile: false,
    root,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { ...config.server, host: "127.0.0.1", port: 47800, strictPort: false },
  });
  try {
    await server.listen();
    const send = vi.spyOn(server.environments.client.hot, "send");
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") throw Error("Missing fixture address");
    await fetch(`http://127.0.0.1:${address.port}/`);
    await delay(100);
    const workspace = join(root, ".runtime/operations-agent/worktrees/new-chat/apps/web");
    await mkdir(workspace, { recursive: true });
    await writeFile(join(workspace, "tsconfig.json"), "{}");
    await writeFile(join(workspace, "index.html"), "<html>Agent workspace</html>");
    await delay(500);
    expect(send.mock.calls.filter(([payload]) => isFullReload(payload))).toEqual([]);
    await writeFile(join(root, "index.html"), "<html><body>Changed web page</body></html>");
    await expect
      .poll(() => send.mock.calls.some(([payload]) => isFullReload(payload)))
      .toBe(true);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 10000);
