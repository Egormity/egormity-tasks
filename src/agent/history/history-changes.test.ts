import { mkdtemp, mkdir, appendFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeHistoryChanges } from "./history-changes.js";

let root: string;
let history: NativeHistoryChanges;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "native-history-changes-"));
  await mkdir(join(root, "sessions", "2026", "10", "12"), { recursive: true });
  await writeFile(join(root, "thread_history_1.sqlite-wal"), "initial");
  history = new NativeHistoryChanges(root);
});
afterEach(async () => {
  history.close();
  await rm(root, { recursive: true, force: true });
});

it("detects database writes/checkpoints, ignores unrelated files and releases shared subscribers", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const unsubscribe = history.subscribe(first);
  const unsubscribeSecond = history.subscribe(second);
  await delay(50);
  await writeFile(join(root, "logs_2.sqlite-wal"), "not chat history");
  await writeFile(join(root, "auth.json"), "private fixture");
  await delay(1100);
  expect(first).not.toHaveBeenCalled();
  await appendFile(join(root, "thread_history_1.sqlite-wal"), "new persisted item");
  await expect.poll(() => first.mock.calls.length).toBe(1);
  expect(second).toHaveBeenCalledTimes(1);
  unsubscribe();
  await rm(join(root, "thread_history_1.sqlite-wal"));
  await writeFile(join(root, "thread_history_1.sqlite"), "checkpoint");
  await expect.poll(() => second.mock.calls.length).toBe(2);
  expect(first).toHaveBeenCalledTimes(1);
  unsubscribeSecond();
  await appendFile(join(root, "thread_history_1.sqlite"), "after disconnect");
  await delay(1100);
  expect(second).toHaveBeenCalledTimes(2);
});

it("observes repeated legacy rollout appends even while the thread index stays unchanged", async () => {
  const changed = vi.fn();
  history.subscribe(changed);
  const path = join(root, "sessions", "2026", "10", "12", "rollout-fixture.jsonl");
  await writeFile(path, "user message\n");
  await expect.poll(() => changed.mock.calls.length).toBe(1);
  await appendFile(path, "commentary\n");
  await appendFile(path, "command output\n");
  await expect.poll(() => changed.mock.calls.length).toBe(2);
});
