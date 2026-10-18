import type { SessionStatus } from "../../api/contracts/session-status.js";
import type { GetAccountResponse } from "../../api/contracts/codex/v2/GetAccountResponse.js";
import type { GetAccountRateLimitsResponse } from "../../api/contracts/codex/v2/GetAccountRateLimitsResponse.js";
import type { Thread } from "../../api/contracts/agent.js";
import { readTokenUsage } from "../history/token-usage.js";
import { readTurnActivity } from "../history/activity.js";
import { defaultControls } from "./model-controls.js";
import { BridgeError, type CodexBridge } from "./bridge.js";

export const readSessionStatus = async (
  bridge: CodexBridge,
  threadId: string | null,
): Promise<SessionStatus> => {
  const account = await bridge.rpc.call<GetAccountResponse>("account/read", {
    refreshToken: false,
  });
  const limitsRead =
    account.account?.type === "chatgpt"
      ? bridge.rpc
          .call<GetAccountRateLimitsResponse>("account/rateLimits/read")
          .catch(() => null)
      : Promise.resolve(null);
  const detailsRead = async () => {
    if (!threadId) {
      const defaults = await defaultControls(
        bridge.rpc,
        bridge.config.repository,
        bridge.config.model,
      );
      return { ...defaults, thread: null, settingsAvailable: true };
    }
    try {
      const native = await bridge.resume(threadId);
      return {
        model: native.model,
        effort: native.reasoningEffort,
        serviceTier: native.serviceTier,
        thread: native.thread,
        settingsAvailable: true,
      };
    } catch (cause) {
      if (!(cause instanceof BridgeError) || cause.status !== 409) throw cause;
      // Reading status must also work for a thread owned by a separate CLI process.
      const { thread } = await bridge.rpc.call<{ thread: Thread }>("thread/read", {
        threadId,
        includeTurns: false,
      });
      return {
        thread,
        model: thread.model,
        effort: thread.reasoningEffort,
        serviceTier: null,
        settingsAvailable: false,
      };
    }
  };
  const [details, limits] = await Promise.all([detailsRead(), limitsRead]);
  const [context, activity] = await Promise.all([
    readTokenUsage(details.thread?.path ?? null),
    threadId ? readTurnActivity(bridge, threadId) : null,
  ]);
  const waiting = [...bridge.rpc.requests.values()].some(
    (request) => request.params.threadId === threadId,
  );
  const working = activity?.status === "inProgress" || details.thread?.status.type === "active";
  const buckets = limits?.rateLimitsByLimitId
    ? Object.values(limits.rateLimitsByLimitId).filter((value) => value !== undefined)
    : limits?.rateLimits
      ? [limits.rateLimits]
      : [];
  return {
    threadId,
    state:
      account.requiresOpenaiAuth && !account.account
        ? "offline"
        : waiting
          ? "waiting"
          : working
            ? "working"
            : "ready",
    model: details.model,
    effort: details.effort,
    serviceTier: details.serviceTier,
    settingsAvailable: details.settingsAvailable,
    account: account.account
      ? {
          type: account.account.type,
          plan: account.account.type === "chatgpt" ? account.account.planType : null,
        }
      : null,
    context,
    limits: buckets.map((bucket) => ({
      name: bucket.limitName ?? bucket.limitId ?? "Codex",
      primary: bucket.primary,
      secondary: bucket.secondary,
    })),
    limitsAvailable: limits !== null,
  };
};
