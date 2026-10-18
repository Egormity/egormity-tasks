import { expect, it } from "vitest";
import type { Thread, ThreadItem } from "@contracts/agent.js";
import { applyCodexEvent } from "./agent-events";
import { attachmentUrl } from "@/features/agent/conversation/CodexItem";

it("applies streamed messages, output and progress to native items and preserves completed history", () => {
  let thread = {
    id: "native",
    turns: [{ id: "turn", items: [], status: "inProgress" }],
  } as unknown as Thread;
  const send = (method: string, params: Record<string, unknown>) => {
    thread = applyCodexEvent(thread, {
      method,
      params: { threadId: "native", turnId: "turn", ...params },
    })!;
  };
  const message = { id: "message", type: "agentMessage", text: "" } as ThreadItem;
  send("item/started", { item: message });
  send("item/agentMessage/delta", { itemId: "message", delta: "First " });
  send("item/agentMessage/delta", { itemId: "message", delta: "reply" });
  send("item/completed", { item: { ...message, text: "First reply" } });
  send("item/started", { item: { id: "cmd", type: "commandExecution", aggregatedOutput: "" } });
  send("item/commandExecution/outputDelta", { itemId: "cmd", delta: "test passed" });
  send("item/started", {
    item: { id: "progress", type: "reasoning", content: [], summary: [] },
  });
  send("item/reasoning/summaryTextDelta", {
    itemId: "progress",
    summaryIndex: 0,
    delta: "Checking",
  });
  send("turn/completed", { turn: { id: "turn", status: "completed", items: [] } });
  expect(thread.turns[0]?.items).toMatchObject([
    { text: "First reply" },
    { aggregatedOutput: "test passed" },
    { summary: ["Checking"] },
  ]);
  expect(thread.turns[0]?.status).toBe("completed");
  expect(
    applyCodexEvent(thread, {
      method: "item/agentMessage/delta",
      params: { threadId: "other", itemId: "message", delta: "wrong" },
    }),
  ).toBe(thread);
});

it("maps only registered upload paths to authenticated downloads", () => {
  expect(
    attachmentUrl(
      "/private/codex/uploads/11111111-1111-4111-8111-111111111111/content-file.png",
    ),
  ).toBe("/api/files/11111111-1111-4111-8111-111111111111");
  expect(attachmentUrl("/private/codex/auth.json")).toBeNull();
});
