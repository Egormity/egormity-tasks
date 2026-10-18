// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Conversation } from "@/features/agent/conversation/Conversation";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";
import type { Thread, ThreadItem } from "@contracts/agent.js";
import { questionId, questionReply } from "./async-questions";

const item: Extract<ThreadItem, { type: "agentMessage" }> = {
  id: "call_question",
  type: "agentMessage",
  phase: "final_answer",
  memoryCitation: null,
  delivery: "async",
  text: "Question as plain fallback text",
  questions: [
    { title: "CPU/RAM limits or servers?", options: ["Both", "CPU/RAM", "Servers"] },
    { title: "Any constraints?", options: null },
  ],
};
const thread = (items: ThreadItem[]) =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    turns: [{ id: "turn", status: "inProgress", items, error: null }],
  }) as Thread;
beforeEach(() => {
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "en", theme: "dark" }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}", { status: 503 }))),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
const view = (detail: Thread, onSend: (text: string, files: File[]) => Promise<boolean>) => (
  <PreferencesProvider>
    <Conversation
      detail={detail}
      loading={false}
      loadFailed={false}
      onReload={vi.fn()}
      events={[]}
      requests={[]}
      busy
      canStop
      disabled={false}
      onSend={onSend}
      onStop={vi.fn()}
      onRespond={vi.fn()}
      onCommand={vi.fn()}
      onStopTerminals={vi.fn()}
      onNew={vi.fn()}
    />
  </PreferencesProvider>
);

it("renders asynchronous native questions during ongoing work and sends identified answers, preserving them on cancellation", async () => {
  const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const questions = item.questions!;
  const detail = thread([item, { type: "plan", id: "next", text: "Other work continues" }]);
  const rendered = render(view(detail, send));
  expect(screen.queryByText(item.text)).toBeNull();
  expect(screen.getByText("Other work continues")).toBeTruthy();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Send answer" }).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Both" }));
  fireEvent.change(screen.getByRole("textbox", { name: questions[1]!.title }), {
    target: { value: "Keep existing projects running" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  const expected = questionReply(item.id, questions, [
    "Both",
    "Keep existing projects running",
  ]);
  await waitFor(() => expect(send).toHaveBeenCalledWith(expected, []));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Send answer" }).disabled,
    ).toBe(false),
  );
  expect(
    screen.getByRole<HTMLTextAreaElement>("textbox", { name: questions[1]!.title }).value,
  ).toBe("Keep existing projects running");
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await screen.findByText("Answer sent");
  const replies = JSON.parse(expected.split("\n")[1]!) as { questionItemId: string }[];
  expect(replies[0]?.questionItemId).toBe(questionId("call_question", 0));
  rendered.unmount();
  render(
    view(
      thread([
        item,
        {
          type: "userMessage",
          id: "reply",
          clientId: null,
          content: [{ type: "text", text: expected, text_elements: [] }],
        },
      ]),
      send,
    ),
  );
  expect(screen.getByText("Answer sent")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send answer" })).toBeNull();
  expect(screen.queryByText(/send_user_message_question_reply/)).toBeNull();
});

it("preserves answers sent from CLI and only submits the remaining questions", async () => {
  const send = vi.fn().mockResolvedValue(true);
  const firstReply = questionReply(item.id, item.questions!, ["CPU/RAM", ""]);
  render(
    view(
      thread([
        item,
        {
          type: "userMessage",
          id: "earlier",
          clientId: null,
          content: [{ type: "text", text: firstReply, text_elements: [] }],
        },
      ]),
      send,
    ),
  );
  expect(screen.queryByRole("radio", { name: "Both" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Any constraints?" }), {
    target: { value: "No downtime" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith(
      questionReply(item.id, item.questions!, ["", "No downtime"]),
      [],
    ),
  );
});
