// @vitest-environment jsdom
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentPage } from "@/features/agent/AgentPage";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";
import type { RpcMessage } from "@contracts/agent.js";

const chatId = "11111111-1111-4111-8111-111111111111";
const challengeId = "22222222-2222-4222-8222-222222222222";
let calls: { path: string; body: unknown }[];
let requests: RpcMessage[];
let trusted: boolean;
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  calls = [];
  requests = [];
  trusted = false;
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "ru", theme: "light" }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ path, body });
      const status = {
        busy: false,
        authenticated: true,
        activeChatId: null,
        loginOutput: "",
        loginRunning: false,
      };
      if (path.startsWith("/api/snapshot")) {
        const thread = {
          id: chatId,
          name: "Chat",
          preview: "",
          cwd: "/repository",
          status: { type: "idle" },
          turns: [],
        };
        return Promise.resolve(
          response({ chats: [thread], detail: thread, cursor: 0, requests, status }),
        );
      }
      if (path === "/api/status") return Promise.resolve(response(status));
      if (path === "/api/confirmations")
        return Promise.resolve(
          trusted
            ? response({ confirmed: true })
            : response(
                {
                  id: challengeId,
                  expiresAt: Date.now() + 300_000,
                  resendAt: Date.now() + 30_000,
                  telegramUrl: "https://t.me/c/4381042765/210",
                },
                201,
              ),
        );
      if (path.endsWith("/messages")) {
        const proof = body as { confirmation?: { code: string } };
        return Promise.resolve(
          trusted || proof.confirmation?.code === "123456"
            ? new Response(null, { status: 202 })
            : response({ error: "Incorrect confirmation code." }, 403),
        );
      }
      if (path === "/api/requests/respond") {
        requests = [];
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    }),
  );
});

it("sends follow-ups without a new dialog or code while the server confirms the work session", async () => {
  trusted = true;
  render(
    <PreferencesProvider>
      <AgentPage onSessionExpired={vi.fn()} />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" }).disabled,
    ).toBe(false),
  );
  const draft = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" });
  fireEvent.change(draft, { target: { value: "Continue the task" } });
  fireEvent.submit(draft.closest("form")!);
  await waitFor(() => expect(draft.value).toBe(""));
  expect(screen.queryByRole("dialog")).toBeNull();
  const sent = calls.filter(({ path }) => path.endsWith("/messages"));
  expect(sent).toHaveLength(1);
  expect(sent[0]?.body).not.toHaveProperty("confirmation");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
const begin = async () => {
  render(
    <PreferencesProvider>
      <AgentPage onSessionExpired={vi.fn()} />
    </PreferencesProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" }).disabled,
    ).toBe(false),
  );
  const draft = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" });
  fireEvent.change(draft, { target: { value: "Investigate the test" } });
  fireEvent.submit(draft.closest("form")!);
  await screen.findByRole("dialog");
  return draft;
};

it("waits for confirmation, preserves the draft on errors and clears it only after verified submission", async () => {
  const draft = await begin();
  expect(calls.some(({ path }) => path.endsWith("/messages"))).toBe(false);
  expect(draft.value).toBe("Investigate the test");
  const code = screen.getByLabelText<HTMLInputElement>("Код подтверждения");
  expect(code.value).toBe("");
  expect(screen.getByRole<HTMLAnchorElement>("link", { name: "Открыть Telegram" }).href).toBe(
    "https://t.me/c/4381042765/210",
  );
  fireEvent.change(code, { target: { value: "000000" } });
  fireEvent.submit(code.closest("form")!);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Неверный код подтверждения.",
  );
  expect(draft.value).toBe("Investigate the test");
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.submit(code.closest("form")!);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(draft.value).toBe(""));
  expect(calls.filter(({ path }) => path.endsWith("/messages")).at(-1)?.body).toMatchObject({
    text: "Investigate the test",
    confirmation: { id: challengeId, code: "123456" },
  });
});

it("cancels confirmation without sending the message or losing the draft", async () => {
  const draft = await begin();
  fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(draft.disabled).toBe(false));
  expect(draft.value).toBe("Investigate the test");
  expect(calls.some(({ path }) => path.endsWith("/messages"))).toBe(false);
  expect(calls.some(({ path }) => path === `/api/confirmations/${challengeId}/cancel`)).toBe(
    true,
  );
});

it.each([
  "123456",
  "\u200e123\u00a0456\u200e",
  "Код: 123-456",
  "Amazi Agent — подтверждение\nЗапрос: 987654ab\nТекст: проверить 654321\n\nКод: 123456\nВведите в течение 5 минут.",
])(
  "pastes a complete Telegram code without truncating it or appending to the old code (%s)",
  async (text) => {
    const draft = await begin();
    const code = screen.getByLabelText<HTMLInputElement>("Код подтверждения");
    expect(document.activeElement).toBe(code);
    expect(code.disabled).toBe(false);
    fireEvent.change(code, { target: { value: "000000" } });
    const paste = createEvent.paste(code, {
      clipboardData: { getData: (type: string) => (type === "text/plain" ? text : "") },
    });
    fireEvent(code, paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(code.value).toBe("123456");
    expect(calls.some(({ path }) => path.endsWith("/messages"))).toBe(false);
    fireEvent.submit(code.closest("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(draft.value).toBe(""));
    expect(calls.filter(({ path }) => path.endsWith("/messages"))).toHaveLength(1);
    expect(calls.find(({ path }) => path.endsWith("/messages"))?.body).toMatchObject({
      confirmation: { id: challengeId, code: "123456" },
    });
  },
);

it("confirms MCP answers through Telegram and cancels confirmation without answering the native request", async () => {
  requests = [
    {
      id: 0,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: chatId,
        mode: "form",
        serverName: "playwright",
        message: "Open the task page?",
        requestedSchema: { type: "object", properties: {} },
      },
    },
  ];
  render(
    <PreferencesProvider>
      <AgentPage onSessionExpired={vi.fn()} />
    </PreferencesProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Разрешить один раз" }));
  await screen.findByRole("dialog");
  expect(calls.find((call) => call.path === "/api/confirmations")?.body).toEqual({
    kind: "response",
    input: { id: 0, result: { action: "accept", content: {}, _meta: null } },
  });
  expect(calls.some((call) => call.path === "/api/requests/respond")).toBe(false);
  const cancel = screen.getAllByRole("button", { name: "Отмена" }).at(-1)!;
  fireEvent.click(cancel);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Open the task page?")).toBeTruthy();
  expect(calls.some((call) => call.path === "/api/requests/respond")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Разрешить один раз" }));
  const code = await screen.findByLabelText("Код подтверждения");
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.submit(code.closest("form")!);
  await waitFor(() => expect(screen.queryByText("Open the task page?")).toBeNull());
  expect(calls.filter((call) => call.path === "/api/requests/respond")).toEqual([
    {
      path: "/api/requests/respond",
      body: {
        id: 0,
        result: { action: "accept", content: {}, _meta: null },
        confirmation: { id: challengeId, code: "123456" },
      },
    },
  ]);
});
