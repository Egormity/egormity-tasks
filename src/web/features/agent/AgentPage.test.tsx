// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentPage } from "./AgentPage";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import { internalTasksPolicy } from "@contracts/policy.js";
import type { Snapshot } from "@contracts/agent.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const chats = [
  { id: firstId, name: "Первый чат", preview: "", turns: [] },
  { id: secondId, name: "Второй чат", preview: "", turns: [] },
];
const status = { busy: false, authenticated: true, activeChatId: null };
const response = (chatId: string, text?: string) =>
  new Response(
    JSON.stringify({
      chats,
      detail: {
        ...chats.find((chat) => chat.id === chatId),
        turns: text
          ? [
              {
                id: "external-turn",
                status: "completed",
                error: null,
                items: [{ id: "external-item", type: "agentMessage", text }],
              },
            ]
          : [],
      },
      status,
      cursor: 0,
      requests: [],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
let resolveSecond: (value: Response) => void;

beforeEach(() => {
  history.replaceState(null, "", `/agent?chat=${firstId}`);
  localStorage.setItem(
    internalTasksPolicy.preferencesStorageKey,
    JSON.stringify({ locale: "ru", theme: "light" }),
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const second = new Promise<Response>((resolve) => {
    resolveSecond = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) => {
      if (path === `/api/snapshot?chatId=${secondId}`)
        return second.then((value) => value.clone());
      if (path === `/api/snapshot?chatId=${firstId}`) return Promise.resolve(response(firstId));
      if (path === "/api/status")
        return Promise.resolve(
          new Response(JSON.stringify(status), {
            headers: { "Content-Type": "application/json" },
          }),
        );
      throw new Error(`Unexpected request: ${path}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  history.replaceState(null, "", "/tasks");
});
const mount = () =>
  render(
    <PreferencesProvider>
      <AgentPage onSessionExpired={vi.fn()} />
    </PreferencesProvider>,
  );

it("keeps one context panel and the composer mounted across live updates", async () => {
  const streams: { onmessage: ((event: { data: string }) => void) | null }[] = [];
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage = null;
      close = vi.fn();
      constructor() {
        streams.push(this);
      }
    },
  );
  const original = vi.mocked(fetch).getMockImplementation()!;
  const context = {
    repository: "/workspace/repository",
    cwd: "/workspace/chats/test",
    branch: "fix/codex/test/2026-10-13",
    threadId: firstId,
    model: "test-model",
    codexHome: "/home/node/.codex",
    sandbox: "danger-full-access",
    sshTargets: [],
    instructions: [{ path: "/app/agent-instructions.md", text: "Agent instructions" }],
  };
  vi.mocked(fetch).mockImplementation((path, options) => {
    if (path === `/api/context?chatId=${firstId}`)
      return Promise.resolve(
        new Response(JSON.stringify(context), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    return original(path, options);
  });
  mount();
  await screen.findByRole("heading", { name: "Первый чат" });
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" });
  fireEvent.click(screen.getByRole("button", { name: "Контекст и инструкции" }));
  await screen.findByText(context.repository);
  expect(screen.getAllByRole("dialog", { name: "Контекст и инструкции" })).toHaveLength(1);
  expect(input.isConnected).toBe(true);
  expect(input.value).toBe("");
  expect(fetch).toHaveBeenCalledWith(`/api/context?chatId=${firstId}`, expect.anything());
  fireEvent.change(input, { target: { value: "Сохранить черновик" } });
  for (let index = 0; index < 3; index++) {
    await act(() => {
      streams[0]!.onmessage?.({
        data: JSON.stringify({ method: "bridge/historyChanged", params: {} }),
      });
      return Promise.resolve();
    });
    expect(screen.getAllByRole("dialog", { name: "Контекст и инструкции" })).toHaveLength(1);
    expect(screen.getAllByText(context.repository)).toHaveLength(1);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe("Сохранить черновик");
  }
  expect(
    vi.mocked(fetch).mock.calls.filter(([path]) => path === `/api/context?chatId=${firstId}`),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
  expect(screen.queryByRole("dialog", { name: "Контекст и инструкции" })).toBeNull();
  expect(input.value).toBe("Сохранить черновик");
});

it("restores direct links, keeps the selected title while loading, and follows browser navigation", async () => {
  const view = mount();
  await screen.findByRole("heading", { name: "Первый чат" });
  expect(fetch).toHaveBeenCalledWith(`/api/snapshot?chatId=${firstId}`, expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "Второй чат" }));
  expect(location.pathname + location.search).toBe(`/agent?chat=${secondId}`);
  expect(screen.getByRole("heading", { name: "Второй чат" })).toBeTruthy();
  expect(screen.getByText("Загружаем историю чата…")).toBeTruthy();
  expect(screen.queryByText("Над чем поработаем?")).toBeNull();
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" }).disabled).toBe(
    true,
  );
  act(() => resolveSecond(response(secondId)));
  await waitFor(() => expect(screen.queryByText("Загружаем историю чата…")).toBeNull());
  expect(screen.getByText("Над чем поработаем?")).toBeTruthy();
  act(() => history.back());
  await screen.findByRole("heading", { name: "Первый чат" });
  expect(location.pathname + location.search).toBe(`/agent?chat=${firstId}`);
  act(() => history.forward());
  await screen.findByRole("heading", { name: "Второй чат" });
  expect(location.pathname + location.search).toBe(`/agent?chat=${secondId}`);
  view.unmount();
  mount();
  await screen.findByRole("heading", { name: "Второй чат" });
  expect(location.pathname + location.search).toBe(`/agent?chat=${secondId}`);
});

it("selects the same native chat from the narrow-screen dropdown", async () => {
  mount();
  await screen.findByRole("heading", { name: "Первый чат" });
  fireEvent.change(screen.getByRole("combobox", { name: "Чаты" }), {
    target: { value: secondId },
  });
  expect(location.pathname + location.search).toBe(`/agent?chat=${secondId}`);
  act(() => resolveSecond(response(secondId)));
  await screen.findByRole("heading", { name: "Второй чат" });
});

it("shows a retry action instead of the new-chat welcome when loading fails", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "Codex request failed." }), { status: 502 }),
  );
  mount();
  await screen.findByText("Не удалось загрузить данные. Попробуйте ещё раз.");
  expect(screen.queryByText("Над чем поработаем?")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Обновить" }));
  await screen.findByRole("heading", { name: "Первый чат" });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("refreshes external CLI history in the background, coalesces updates during reads and keeps draft/scroll", async () => {
  const streams: {
    onmessage: ((event: { data: string }) => void) | null;
    close: () => void;
  }[] = [];
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage = null;
      close = vi.fn();
      constructor() {
        streams.push(this);
      }
    },
  );
  let resolveRefresh: (value: Response) => void = () => undefined;
  const refresh = new Promise<Response>((resolve) => {
    resolveRefresh = resolve;
  });
  let reads = 0;
  vi.mocked(fetch).mockImplementation((path) => {
    if (typeof path === "string" && path.endsWith("/controls"))
      return Promise.resolve(
        new Response(JSON.stringify({ model: "fixture", models: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    reads++;
    return reads === 1
      ? Promise.resolve(response(firstId, "Начало работы CLI"))
      : reads === 2
        ? refresh
        : Promise.resolve(response(firstId, "Последнее обновление CLI"));
  });
  const view = mount();
  await screen.findByText("Начало работы CLI");
  const composer = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" });
  fireEvent.change(composer, { target: { value: "Мой черновик" } });
  const history = screen.getByRole("region");
  Object.defineProperties(history, {
    scrollHeight: { value: 2000 },
    clientHeight: { value: 300 },
  });
  history.scrollTop = 200;
  fireEvent.scroll(history);
  const changed = () =>
    act(() =>
      streams[0]!.onmessage?.({
        data: JSON.stringify({ method: "bridge/historyChanged", params: {} }),
      }),
    );
  changed();
  changed();
  changed();
  expect(reads).toBe(2);
  expect(screen.getByText("Начало работы CLI")).toBeTruthy();
  expect(screen.queryByText("Загружаем историю чата…")).toBeNull();
  expect(composer.disabled).toBe(false);
  act(() => resolveRefresh(response(firstId, "Промежуточное обновление CLI")));
  await screen.findByText("Последнее обновление CLI");
  expect(reads).toBe(3);
  expect(screen.getByRole("region")).toBe(history);
  expect(history.scrollTop).toBe(200);
  expect(screen.getByRole("textbox", { name: "Сообщение" })).toBe(composer);
  expect(composer.value).toBe("Мой черновик");
  expect(screen.queryByText("bridge/historyChanged")).toBeNull();
  view.unmount();
  expect(streams[0]!.close).toHaveBeenCalledOnce();
});

it("keeps the composer available during CLI activity and exposes a thread-scoped Stop button", async () => {
  const working = (await response(firstId, "Агент проверяет код").json()) as Snapshot;
  working.status = {
    ...working.status,
    busy: true,
    activeChatId: firstId,
    externalTurns: [{ threadId: firstId, turnId: "external-turn" }],
    canStop: false,
  };
  working.detail!.turns[0]!.status = "inProgress";
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(working), { headers: { "Content-Type": "application/json" } }),
  );
  mount();
  await screen.findByText("Агент проверяет код");
  expect(screen.getByRole("status").textContent).toBe("Работает в CLI");
  expect(screen.getByText("Выполняет запрос…")).toBeTruthy();
  expect(
    screen.queryByText("Задача прервана. Проверьте результат перед продолжением."),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Остановить задачу" })).toBeTruthy();
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" }).disabled).toBe(
    false,
  );
  const stopped = (await response(firstId, "Агент проверяет код").json()) as Snapshot;
  stopped.detail!.turns[0]!.status = "interrupted";
  vi.mocked(fetch).mockImplementation((path) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          typeof path === "string" && path.endsWith("/status") ? stopped.status : stopped,
        ),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    ),
  );
  await waitFor(
    () => {
      expect(screen.getByRole("status").textContent).toBe("Готов к работе");
      expect(
        screen.getByText("Задача прервана. Проверьте результат перед продолжением."),
      ).toBeTruthy();
    },
    { timeout: 3500 },
  );
  expect(screen.queryByText("Выполняет запрос…")).toBeNull();
});

it.each([false, true])(
  "does not attribute another thread's activity to this conversation (draft=%s)",
  async (draft) => {
    if (draft) history.replaceState(null, "", "/agent?new=1");
    const snapshot = (await response(firstId).json()) as Snapshot;
    if (draft) snapshot.detail = null;
    snapshot.status = {
      ...snapshot.status,
      busy: true,
      activeChatId: secondId,
      externalTurns: [{ threadId: secondId, turnId: "other-turn" }],
      canStop: true,
    };
    vi.mocked(fetch).mockImplementation((path) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            typeof path === "string" && path.endsWith("/controls")
              ? { model: "native", models: [] }
              : typeof path === "string" && path.endsWith("/status")
                ? snapshot.status
                : snapshot,
          ),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    mount();
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Сообщение" }).disabled,
      ).toBe(false),
    );
    expect(screen.getByRole("status").textContent).toBe("Готов к работе");
    expect(screen.queryByText("Выполняет запрос…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Остановить задачу" })).toBeNull();
  },
);
