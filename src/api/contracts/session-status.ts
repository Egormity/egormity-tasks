import type { RateLimitWindow } from "./codex/v2/RateLimitWindow.js";

/** Public snapshot of native Codex state; never includes credentials or raw configuration. */
export type SessionStatus = {
  threadId: string | null;
  state: "ready" | "working" | "waiting" | "offline";
  model: string | null;
  effort: string | null;
  serviceTier: string | null;
  settingsAvailable: boolean;
  account: { type: string; plan: string | null } | null;
  context: { tokens: number; window: number | null; totalTokens: number } | null;
  limits: {
    name: string;
    primary: RateLimitWindow | null;
    secondary: RateLimitWindow | null;
  }[];
  limitsAvailable: boolean;
};
