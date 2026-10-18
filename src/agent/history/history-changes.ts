import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const historyStore = /^(?:thread_history|state)_\d+\.sqlite(?:-wal)?$|^session_index\.jsonl$/u;

/** Observe native persistence, including other CLI processes, without loading/resuming threads. */
export class NativeHistoryChanges {
  private listeners = new Set<() => void>();
  private stop: (() => void) | undefined;

  constructor(private readonly codexHome: string) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.stop) this.start();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.close();
    };
  };

  private start() {
    let stopped = false;
    let dirty = false;
    let previous: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const watchers = new Map<string, FSWatcher>();

    const poll = async () => {
      // Legacy rollout files can change without updating the native thread index.
      // Watch only session directories, never account/config/plugin contents.
      for (const directory of ["sessions", "archived_sessions"]) {
        if (watchers.has(directory)) continue;
        try {
          const watcher = watch(
            join(this.codexHome, directory),
            { recursive: true, persistent: false },
            (_event, filename) => {
              if (!filename || filename.endsWith(".jsonl")) dirty = true;
            },
          );
          watcher.on("error", () => {
            watcher.close();
            watchers.delete(directory);
            dirty = true;
          });
          watchers.set(directory, watcher);
          if (previous !== undefined) dirty = true;
        } catch (error) {
          // Missing directories are normal in fresh profiles. Retry on the next tick.
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") dirty = true;
        }
      }
      try {
        const names = (await readdir(this.codexHome)).filter((name) => historyStore.test(name));
        const stamps = await Promise.all(
          names.sort().map(async (name) => {
            try {
              const value = await stat(join(this.codexHome, name), { bigint: true });
              return `${name}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") return `${name}:missing`;
              throw error;
            }
          }),
        );
        const current = stamps.join("|");
        if (previous !== undefined && current !== previous) dirty = true;
        previous = current;
      } catch {
        // If observation fails, invalidate instead of silently leaving browsers stale.
        dirty = true;
      }
      if (stopped) return;
      if (dirty) {
        dirty = false;
        for (const listener of this.listeners) listener();
      }
      // One shared, bounded invalidation per second, even during continuous writes.
      timer = setTimeout(() => void poll(), 1000);
      timer.unref();
    };
    this.stop = () => {
      stopped = true;
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    };
    void poll();
  }

  close = () => {
    this.stop?.();
    this.stop = undefined;
    this.listeners.clear();
  };
}
