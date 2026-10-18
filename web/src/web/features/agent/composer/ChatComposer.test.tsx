// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";
import { Conversation } from "@/features/agent/conversation/Conversation";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";
import type { Thread } from "@contracts/agent.js";

const id = "11111111-1111-4111-8111-111111111111";
const controls = {
  model: "native-model",
  effort: "medium",
  serviceTier: "default",
  models: [
    {
      model: "native-model",
      displayName: "Native model",
      supportedReasoningEfforts: [{ reasoningEffort: "medium" }, { reasoningEffort: "high" }],
      defaultReasoningEffort: "medium",
      serviceTiers: [{ id: "priority", name: "Fast" }],
    },
  ],
};
const sessionStatus = {
  threadId: id,
  state: "working",
  model: "native-model",
  effort: "high",
  serviceTier: "priority",
  settingsAvailable: true,
  account: { type: "chatgpt", plan: "pro" },
  context: { tokens: 32000, window: 128000, totalTokens: 250000 },
  limitsAvailable: true,
  limits: [
    {
      name: "Codex",
      primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1900000000 },
      secondary: null,
    },
  ],
};
const actions = () => ({
  onSend: vi.fn().mockResolvedValue(true),
  onStop: vi.fn().mockResolvedValue(true),
  onCommand: vi.fn().mockResolvedValue(true),
  onStopTerminals: vi.fn().mockResolvedValue(true),
  onNew: vi.fn().mockResolvedValue(true),
});
beforeEach(() => {
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "en", theme: "dark" }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            path.startsWith("/api/session-status")
              ? sessionStatus
              : path.endsWith("/terminals")
                ? [{ processId: "native-process-1", command: "sleep 500", cwd: "/workspace" }]
                : controls,
          ),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const mount = () => {
  const callbacks = actions();
  render(
    <PreferencesProvider>
      <ChatComposer chatId={id} disabled={false} busy canStop {...callbacks} />
    </PreferencesProvider>,
  );
  return callbacks;
};

it("opens native /status without sending a prompt or opening server context, and preserves the draft on refresh", async () => {
  const callbacks = mount();
  const input = screen.getByLabelText<HTMLTextAreaElement>("Message");
  fireEvent.change(input, { target: { value: "/status" } });
  fireEvent.keyDown(input, { key: "Enter" });
  const panel = await screen.findByRole("dialog", { name: "Codex status" });
  await within(panel).findByText("75% remaining");
  expect(within(panel).getByText("32,000 / 128,000")).toBeTruthy();
  expect(within(panel).getByText("Working")).toBeTruthy();
  expect(within(panel).getByText("Fast")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith(`/api/session-status?chatId=${id}`, expect.anything());
  expect(callbacks.onSend).not.toHaveBeenCalled();
  expect(callbacks.onCommand).not.toHaveBeenCalled();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.some(([path]) => typeof path === "string" && path.includes("/context")),
  ).toBe(false);
  fireEvent.change(input, { target: { value: "Keep my draft" } });
  fireEvent.click(within(panel).getByRole("button", { name: "Refresh" }));
  await within(panel).findByText("75% remaining");
  expect(input.value).toBe("Keep my draft");
  expect(screen.getAllByRole("dialog", { name: "Codex status" })).toHaveLength(1);
  fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Codex status" })).toBeNull();
  expect(input.value).toBe("Keep my draft");
});

it("sends follow-ups during work, keeps attachment controls enabled, and preserves Shift+Enter and IME", async () => {
  const callbacks = mount();
  const input = screen.getByLabelText<HTMLTextAreaElement>("Message");
  expect(input.disabled).toBe(false);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Attach file" }).disabled).toBe(
    false,
  );
  fireEvent.change(input, { target: { value: "Follow up" } });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(callbacks.onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(input.value).toBe(""));
  expect(callbacks.onSend).toHaveBeenCalledWith("Follow up", []);
  fireEvent.click(screen.getByRole("button", { name: "Stop task" }));
  expect(callbacks.onStop).toHaveBeenCalledOnce();
});

it("chooses slash commands with the keyboard and changes native model settings instead of sending prompts", async () => {
  const callbacks = mount();
  const settings = screen.getByRole("button", { name: "Model and reasoning" });
  await waitFor(() => expect(settings.textContent).toBe("Native model· medium· Standard"));
  fireEvent.click(settings);
  await screen.findByRole("combobox", { name: "Model" });
  expect(settings.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Model and reasoning" })).toBeNull();
  expect(settings.getAttribute("aria-expanded")).toBe("false");
  const input = screen.getByLabelText("Message");
  fireEvent.change(input, { target: { value: "/mo" } });
  expect(screen.getByRole("listbox", { name: "Commands" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Find a command…" }), {
    key: "Enter",
  });
  await screen.findByRole("combobox", { name: "Model" });
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Speed" }).value).toBe("");
  fireEvent.change(screen.getByRole("combobox", { name: "Reasoning effort" }), {
    target: { value: "high" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Speed" }), {
    target: { value: "priority" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(callbacks.onCommand).toHaveBeenCalledWith({
      command: "settings",
      model: "native-model",
      effort: "high",
      serviceTier: "priority",
    }),
  );
  expect(callbacks.onSend).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "/compact" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(callbacks.onCommand).toHaveBeenCalledWith({ command: "compact" });
  fireEvent.change(input, { target: { value: "/" } });
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Find a command…" }), {
    key: "ArrowDown",
  });
  expect(screen.getByRole("option", { selected: true }).textContent).toContain("/fast");
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Find a command…" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("lists actual native terminals and stops one or all in the selected chat", async () => {
  const callbacks = mount();
  const input = screen.getByLabelText("Message");
  fireEvent.change(input, { target: { value: "/ps" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await screen.findByText("sleep 500");
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(callbacks.onStopTerminals).toHaveBeenCalledWith("native-process-1");
  await screen.findByText("sleep 500");
  fireEvent.click(screen.getByRole("button", { name: "Stop all processes" }));
  expect(callbacks.onStopTerminals).toHaveBeenCalledWith(undefined);
});

it("renders user messages without an account identity and places activity after live events", () => {
  const detail = {
    id,
    turns: [
      {
        id: "turn",
        status: "inProgress",
        items: [
          { type: "userMessage", id: "message", content: [{ type: "text", text: "Hello" }] },
        ],
      },
    ],
  } as unknown as Thread;
  render(
    <PreferencesProvider>
      <Conversation
        detail={detail}
        events={[{ method: "native/event", params: {} }]}
        requests={[]}
        loading={false}
        loadFailed={false}
        onReload={vi.fn()}
        busy
        canStop
        disabled={false}
        onRespond={vi.fn()}
        {...actions()}
      />
    </PreferencesProvider>,
  );
  expect(screen.getByRole("article", { name: "User message" }).textContent).toBe("Hello");
  expect(screen.queryByText("Admin")).toBeNull();
  expect(screen.queryByText("Administrator")).toBeNull();
  const events = screen.getByText("Live Codex events (1)");
  const running = screen.getByText("Working on your request…");
  expect(
    events.compareDocumentPosition(running) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("reads defaults without a chat and applies draft settings with the first message", async () => {
  const callbacks = actions();
  render(
    <PreferencesProvider>
      <ChatComposer
        chatId={null}
        disabled={false}
        busy={false}
        canStop={false}
        {...callbacks}
      />
    </PreferencesProvider>,
  );
  const settings = screen.getByRole("button", { name: "Model and reasoning" });
  await waitFor(() => expect(settings.textContent).toContain("Native model"));
  expect(fetch).toHaveBeenCalledWith("/api/controls", expect.anything());
  fireEvent.click(settings);
  fireEvent.change(await screen.findByRole("combobox", { name: "Reasoning effort" }), {
    target: { value: "high" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Speed" }), {
    target: { value: "priority" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(callbacks.onCommand).not.toHaveBeenCalled();
  expect(callbacks.onNew).not.toHaveBeenCalled();
  expect(settings.textContent).toBe("Native model· high· Fast");
  fireEvent.click(settings);
  expect(
    screen.getByRole<HTMLSelectElement>("combobox", { name: "Reasoning effort" }).value,
  ).toBe("high");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  const input = screen.getByLabelText("Message");
  fireEvent.change(input, { target: { value: "/status" } });
  fireEvent.keyDown(input, { key: "Enter" });
  const statusPanel = await screen.findByRole("dialog", { name: "Codex status" });
  await within(statusPanel).findByText("Fast");
  expect(within(statusPanel).getByText("high")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/api/session-status", expect.anything());
  fireEvent.click(within(statusPanel).getByRole("button", { name: "Close" }));
  expect(settings.textContent).toBe("Native model· high· Fast");
  fireEvent.change(input, { target: { value: "/" } });
  expect(screen.getByRole<HTMLButtonElement>("option", { name: /\/model/ }).disabled).toBe(
    false,
  );
  expect(screen.getByRole<HTMLButtonElement>("option", { name: /\/compact/ }).disabled).toBe(
    true,
  );
  expect(screen.getByRole<HTMLButtonElement>("option", { name: /\/stop/ }).disabled).toBe(true);
  fireEvent.change(input, { target: { value: "First message" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() =>
    expect(callbacks.onSend).toHaveBeenCalledWith("First message", [], {
      model: "native-model",
      effort: "high",
      serviceTier: "priority",
    }),
  );
});
