import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import WebSocket from "ws";
import type { InternalTasksAgentEnvironment } from "../config.js";
import type { RpcMessage } from "../../api/contracts/agent.js";
import { spawnCodex, stopProcess } from "./process.js";

type Pending = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** One CLI app-server. Codex is the sole owner of thread persistence. */
export class CodexRpc extends EventEmitter {
  private child: ReturnType<typeof spawnCodex> | undefined;
  private socket: WebSocket | undefined;
  private write: ((message: string) => void) | undefined;
  private starting: Promise<void> | undefined;
  private sequence = 0;
  private eventSequence = 0;
  private pending = new Map<number, Pending>();
  readonly requests = new Map<string | number, RpcMessage>();
  private closed = false;
  constructor(
    private config: InternalTasksAgentEnvironment,
    private path: string,
  ) {
    super();
  }

  private start = () => {
    if (this.closed) return Promise.reject(new Error("Codex bridge is closed."));
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const socketPath = join(
        this.config.codexHome,
        "app-server-control/app-server-control.sock",
      );
      const shared = await stat(socketPath).then(
        (value) => value.isSocket(),
        () => false,
      );
      if (this.closed) throw new Error("Codex bridge is closed.");
      let stderr = "";
      let disconnected = false;
      const receive = (line: string) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line) as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof message.method === "string") {
          const event = { ...message, sequence: ++this.eventSequence } as RpcMessage;
          if (event.id !== undefined) this.requests.set(event.id, event);
          if (event.method === "serverRequest/resolved")
            this.requests.delete(event.params.requestId as string | number);
          if (event.method === "turn/completed") {
            for (const [id, request] of this.requests) {
              if (request.params.threadId === event.params.threadId) this.requests.delete(id);
            }
          }
          this.emit("notification", event);
          return;
        }
        const pending =
          typeof message.id === "number" ? this.pending.get(message.id) : undefined;
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id as number);
        if (message.error) {
          const error = message.error as { message?: string };
          pending.reject(new Error(error.message ?? "Codex request failed."));
        } else pending.resolve({ value: message.result, cursor: this.eventSequence });
      };
      const failed = (error: Error) => {
        if (disconnected) return;
        disconnected = true;
        this.child = undefined;
        this.socket = undefined;
        this.write = undefined;
        this.starting = undefined;
        this.requests.clear();
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pending.clear();
        this.emit("notification", {
          method: "bridge/disconnected",
          params: { message: error.message },
        });
      };
      if (shared) {
        // The native daemon speaks WebSocket over its private Unix socket.
        // Closing this client must never stop the daemon or its CLI turns.
        const socket = new WebSocket(`ws+unix://${socketPath}:/`);
        this.socket = socket;
        socket.on("message", (data) =>
          receive(
            (Array.isArray(data)
              ? Buffer.concat(data)
              : Buffer.isBuffer(data)
                ? data
                : Buffer.from(data)
            ).toString("utf8"),
          ),
        );
        socket.on("error", () => {});
        socket.once("close", () => failed(new Error("Codex app-server disconnected.")));
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            socket.terminate();
            reject(new Error("Codex connection timed out."));
          }, 5000);
          socket.once("open", () => {
            clearTimeout(timer);
            resolve();
          });
          socket.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
        });
        this.write = (message) => socket.send(message);
      } else {
        const child = spawnCodex(this.config, this.path, [
          "app-server",
          "--listen",
          "stdio://",
        ]);
        this.child = child;
        child.stderr.on("data", (chunk: Buffer) => {
          stderr = (stderr + chunk.toString()).slice(-4000);
        });
        const lines = createInterface({ input: child.stdout });
        lines.on("line", receive);
        child.once("error", failed);
        child.stdin.once("error", (error) => {
          stopProcess(child);
          failed(error);
        });
        child.once("close", () => {
          lines.close();
          failed(new Error(stderr || "Codex app-server disconnected."));
        });
        this.write = (message) => {
          child.stdin.write(message + "\n");
        };
      }
      await this.send("initialize", {
        clientInfo: { name: "amazi_agent", title: "Amazi Agent", version: "0.19.2" },
        capabilities: { experimentalApi: true },
      });
      this.write(JSON.stringify({ method: "initialized", params: {} }));
    })();
    return this.starting;
  };

  private send = (method: string, params: object): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // A timed-out turn/start must not release admission while Codex may still be working.
        if (this.child) stopProcess(this.child);
        this.socket?.terminate();
        reject(new Error("Codex request timed out. Check the conversation before retrying."));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write!(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("Codex request could not be sent."));
      }
    });

  callWithCursor = async <T>(
    method: string,
    params: object = {},
  ): Promise<{ value: T; cursor: number }> => {
    await this.start();
    return (await this.send(method, params)) as { value: T; cursor: number };
  };
  call = async <T>(method: string, params: object = {}): Promise<T> =>
    (await this.callWithCursor<T>(method, params)).value;
  respond = (id: string | number, result: unknown) => {
    if (!this.requests.has(id) || !this.write)
      throw new Error("This Codex request is no longer pending.");
    this.write(JSON.stringify({ id, result }));
    this.requests.delete(id);
    this.emit("notification", { method: "bridge/requestResolved", params: { id } });
  };
  close = async () => {
    this.closed = true;
    if (this.socket) {
      const socket = this.socket;
      await new Promise<void>((resolve) => {
        socket.once("close", () => resolve());
        socket.terminate();
      });
      return;
    }
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once("close", () => resolve());
      stopProcess(child);
    });
  };
}
