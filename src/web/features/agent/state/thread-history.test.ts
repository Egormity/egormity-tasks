import { expect, it } from "vitest";
import type { Thread, Turn } from "@contracts/agent.js";
import { mergeThreadHistory } from "./thread-history";

const thread = (turns: Partial<Turn>[], id = "chat") => ({ id, turns }) as Thread;

it("replaces the anchor and appends new turns without duplicating the older history", () => {
  const previous = thread([{ id: "old" }, { id: "current", status: "inProgress" }]);
  const incoming = thread([{ id: "current", status: "completed" }, { id: "next" }]);
  const result = mergeThreadHistory(previous, incoming);
  expect(result?.turns).toEqual([
    { id: "old" },
    { id: "current", status: "completed" },
    { id: "next" },
  ]);
  expect(previous.turns[1]?.status).toBe("inProgress");
});

it("requires a full read when an anchor is absent or belongs to another chat", () => {
  expect(mergeThreadHistory(thread([{ id: "old" }]), thread([{ id: "unknown" }]))).toBeNull();
  expect(
    mergeThreadHistory(thread([{ id: "old" }]), thread([{ id: "old" }], "other")),
  ).toBeNull();
});
