import type { RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";

/** Invalidation only; SQLite remains the source of board data. One API process owns it. */
export class BoardEvents {
  version: string = randomUUID();
  private readonly clients = new Set<Response>();

  private send = (response: Response) => {
    if (response.writableEnded || response.destroyed) return;
    if (!response.write(`data: ${JSON.stringify({ version: this.version })}\n\n`))
      response.end();
  };

  changed = () => {
    this.version = randomUUID();
    for (const response of this.clients) this.send(response);
  };

  subscribe: RequestHandler = (_request, response) => {
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    // Reconnect through requireAdmin periodically, including after session revocation.
    const session = setTimeout(() => response.end(), 60_000);
    const heartbeat = setInterval(() => {
      if (!response.write(": heartbeat\n\n")) response.end();
    }, 15_000);
    this.clients.add(response);
    response.once("close", () => {
      clearTimeout(session);
      clearInterval(heartbeat);
      this.clients.delete(response);
    });
    response.write("retry: 1000\n\n");
    this.send(response);
  };

  close = () => {
    for (const response of this.clients) response.end();
  };
}
