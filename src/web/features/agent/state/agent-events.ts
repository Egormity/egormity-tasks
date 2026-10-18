import type { RpcMessage, Thread, ThreadItem, Turn } from "@contracts/agent.js";

export const applyCodexEvent = (thread: Thread | null, event: RpcMessage): Thread | null => {
  if (!thread || event.params.threadId !== thread.id) return thread;
  const params = event.params;
  if (event.method === "thread/name/updated")
    return { ...thread, name: String(params.threadName ?? params.name) };
  if (event.method === "thread/status/changed")
    return { ...thread, status: params.status as Thread["status"] };
  const turns = [...thread.turns];
  if (event.method === "turn/started" || event.method === "turn/completed") {
    const incoming = params.turn as Turn;
    const index = turns.findIndex((turn) => turn.id === incoming.id);
    if (index < 0) turns.push(incoming);
    else
      turns[index] = {
        ...turns[index]!,
        ...incoming,
        items: incoming.items.length ? incoming.items : turns[index]!.items,
      };
    return { ...thread, turns };
  }
  const index = turns.findIndex((turn) => turn.id === params.turnId);
  if (index < 0) return thread;
  const turn = { ...turns[index]!, items: [...turns[index]!.items] };
  if (event.method === "item/started" || event.method === "item/completed") {
    const item = params.item as ThreadItem;
    const itemIndex = turn.items.findIndex((value) => value.id === item.id);
    if (itemIndex < 0) turn.items.push(item);
    else turn.items[itemIndex] = item;
  } else if (event.method.endsWith("/delta") || event.method.endsWith("Delta")) {
    const itemIndex = turn.items.findIndex((value) => value.id === params.itemId);
    const item = turn.items[itemIndex];
    const delta = typeof params.delta === "string" ? params.delta : "";
    if (item?.type === "agentMessage" || item?.type === "plan")
      turn.items[itemIndex] = { ...item, text: item.text + delta };
    if (item?.type === "commandExecution")
      turn.items[itemIndex] = {
        ...item,
        aggregatedOutput: (item.aggregatedOutput ?? "") + delta,
      };
    if (item?.type === "reasoning") {
      const key = event.method.includes("summary") ? "summary" : "content";
      const values = [...item[key]];
      const part = Number(params.summaryIndex ?? params.contentIndex ?? 0);
      values[part] = (values[part] ?? "") + delta;
      turn.items[itemIndex] = { ...item, [key]: values };
    }
  }
  turns[index] = turn;
  return { ...thread, turns };
};
