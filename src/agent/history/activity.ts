import type { CodexBridge } from "../codex/bridge.js";
import type { Thread, Turn } from "../../api/contracts/agent.js";

export const readTurnActivity = async (
  bridge: CodexBridge,
  threadId: string,
  turnId?: string,
) => {
  const page = await bridge.rpc.call<{ data: Turn[] }>("thread/turns/list", {
    threadId,
    limit: turnId ? 20 : 1,
    sortDirection: "desc",
    itemsView: "summary",
  });
  const turn = turnId
    ? (page.data.find((item) => item.id === turnId) ??
      (await bridge.read(threadId)).turns.find((item) => item.id === turnId))
    : page.data[0];
  if (!turn) return null;
  const external = await bridge.externalTurns();
  const active = external.some((item) => item.threadId === threadId && item.turnId === turn.id);
  const { thread } = await bridge.rpc.call<{ thread: Thread }>("thread/read", {
    threadId,
    includeTurns: false,
  });
  return {
    id: turn.id,
    status: active
      ? "inProgress"
      : turn.status === "inProgress" && thread.status.type === "idle"
        ? "interrupted"
        : turn.status,
    completedAt: active ? null : turn.completedAt,
  };
};
