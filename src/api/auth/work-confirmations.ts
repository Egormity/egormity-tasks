import { createHash } from "node:crypto";
import type { ConfirmationOwner } from "./confirmation-store.js";
import type { InternalTasksEnvironment } from "../config.js";
import type { ConfirmationAction } from "../contracts/confirmation.js";
import type { Snapshot, Turn } from "../contracts/agent.js";
import { HttpError } from "./auth.js";

export const workConfirmationGrace = 5 * 60_000;
type Activity = Pick<Turn, "id" | "status" | "completedAt"> | null;
type Grant = {
  until: number;
  pending: number;
  turns: Map<string, string>;
  sessionHash: string;
};
const sessionHash = (session: string) => createHash("sha256").update(session).digest("hex");
const key = (owner: ConfirmationOwner) =>
  createHash("sha256").update(`${owner.id}:${owner.session}`).digest("hex");

/** Session-scoped permission, not a reusable code. Native turn timestamps determine expiry. */
export class WorkConfirmations {
  private grants = new Map<string, Grant>();
  constructor(private config: InternalTasksEnvironment) {}
  private worker = async <T>(path: string): Promise<T> => {
    try {
      const response = await fetch(this.config.workerUrl + path, {
        headers: { Authorization: `Bearer ${this.config.workerToken}` },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
      if (!response.ok) throw Error("Worker unavailable");
      return (await response.json()) as T;
    } catch {
      throw new HttpError(503, "The Codex worker is unavailable.");
    }
  };
  private activity = (chatId: string, turnId?: string) =>
    this.worker<Activity>(
      `/activity/${encodeURIComponent(chatId)}${turnId ? `?turnId=${encodeURIComponent(turnId)}` : ""}`,
    );
  allowed = async (owner: ConfirmationOwner) => {
    const id = key(owner);
    const grant = this.grants.get(id);
    if (!grant) return false;
    if (grant.pending || grant.until > Date.now()) return true;
    let active = false;
    await Promise.all(
      [...grant.turns].map(async ([chatId, turnId]) => {
        const turn = await this.activity(chatId, turnId);
        if (turn?.id === turnId && turn.status === "inProgress") active = true;
        else {
          if (turn?.id === turnId && typeof turn.completedAt === "number")
            grant.until = Math.max(
              grant.until,
              turn.completedAt * 1000 + workConfirmationGrace,
            );
          grant.turns.delete(chatId);
        }
      }),
    );
    if (active || grant.pending || grant.until > Date.now()) return true;
    if (this.grants.get(id) === grant) this.grants.delete(id);
    return false;
  };
  authorize = (owner: ConfirmationOwner) => {
    this.grants.set(key(owner), {
      until: Date.now() + workConfirmationGrace,
      pending: 0,
      turns: new Map(),
      sessionHash: sessionHash(owner.session),
    });
    if (this.grants.size > 10_000) this.grants.delete(this.grants.keys().next().value!);
  };
  revoke = (session: string) => {
    for (const [id, grant] of this.grants)
      if (grant.sessionHash === sessionHash(session)) this.grants.delete(id);
  };
  begin = async (owner: ConfirmationOwner, action: ConfirmationAction) => {
    const grant = this.grants.get(key(owner));
    if (!grant) throw new HttpError(403, "Confirm this action with a Telegram code.");
    let chatId =
      action.kind === "message" || action.kind === "command" ? action.chatId : undefined;
    if (action.kind === "response") {
      const snapshot = await this.worker<Snapshot>("/snapshot");
      const request = snapshot.requests.find((value) => value.id === action.input.id);
      if (typeof request?.params.threadId === "string") chatId = request.params.threadId;
    }
    grant.pending += 1;
    let finished = false;
    return async (success: boolean) => {
      if (finished) return;
      finished = true;
      try {
        if (success && chatId) {
          const turn = await this.activity(chatId);
          if (turn) {
            grant.turns.set(chatId, turn.id);
            if (typeof turn.completedAt === "number")
              grant.until = Math.max(
                grant.until,
                turn.completedAt * 1000 + workConfirmationGrace,
              );
          }
        }
      } finally {
        grant.pending -= 1;
      }
    };
  };
}
