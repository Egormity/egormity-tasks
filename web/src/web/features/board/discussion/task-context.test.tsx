// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatComposer } from "@/features/agent/composer/ChatComposer";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import type { Task } from "@contracts/board.js";
import { taskContextText } from "./task-context";
import { en } from "@/shared/i18n/copy";

const task: Task = {
  id: "task",
  title: "Review integration",
  description: "Plan it first",
  status: "backlog",
  priority: "medium",
  order: 0,
  revision: 1,
  tagIds: [],
  archivedAt: null,
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
  attachments: [
    { id: "file", name: "details.txt", type: "text/plain", size: 4, sha256: "a".repeat(64) },
  ],
};
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ model: "fixture", models: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  localStorage.setItem(
    "amazi-operations-preferences",
    JSON.stringify({ locale: "en", theme: "light" }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});
const mount = (value = task) => {
  const onSend = vi.fn().mockResolvedValue(true);
  const view = render(
    <PreferencesProvider>
      <ChatComposer
        task={value}
        chatId={null}
        disabled={false}
        busy={false}
        canStop={false}
        onSend={onSend}
        onStop={vi.fn()}
        onCommand={vi.fn()}
        onStopTerminals={vi.fn()}
        onNew={vi.fn()}
      />
    </PreferencesProvider>,
  );
  return { ...view, onSend };
};

it("pins context before every message and sends files attached by the user", async () => {
  const { container, onSend } = mount();
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "Updated note" } });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["mine"], "personal.txt", { type: "text/plain" })] },
  });
  expect(screen.getByText("personal.txt")).toBeTruthy();
  expect(input.value).toBe("Updated note");
  expect(screen.getByRole("region", { name: "Task context" }).textContent).toContain(task.id);
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
  expect(onSend.mock.calls[0]![0]).toBe(`${taskContextText(task, en)}\n\nUpdated note`);
  expect((onSend.mock.calls[0]![1] as File[]).map((file) => file.name)).toEqual([
    "personal.txt",
  ]);
  await waitFor(() => expect(input.value).toBe(""));
  fireEvent.change(input, { target: { value: "Follow-up" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
  expect(onSend.mock.calls[1]).toEqual([`${taskContextText(task, en)}\n\nFollow-up`, []]);
});

it("keeps task messages available when a board attachment has no stored bytes", async () => {
  const { onSend } = mount({
    ...task,
    attachments: [{ id: "missing", name: "missing.txt", size: 5 }],
  });
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "My question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(onSend).toHaveBeenCalledWith(`${taskContextText(task, en)}\n\nMy question`, []),
  );
});
