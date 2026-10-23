// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "@/app/App";
import { PreferencesProvider } from "@/shared/i18n/preferences";
import type { LiveBoardSnapshot, Task } from "@contracts/board.js";
import { taskContextText } from "./task-context";
import { en } from "@/shared/i18n/copy";

const chatId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const card: Task = {
  id: "task-one",
  title: "Investigate latency",
  description: "Review timing before coding.",
  priority: "medium",
  status: "backlog",
  order: 0,
  revision: 1,
  archivedAt: null,
  tagIds: [],
  attachments: [],
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
};
const status = {
  authenticated: true,
  busy: false,
  activeChatId: null,
  externalTurns: [],
  canStop: false,
};
const thread = (n: number, started = false) => ({
  id: chatId(n),
  name: n === 90 ? "General CLI conversation" : `Task conversation ${n}`,
  preview: "",
  turns: started
    ? [
        {
          id: `turn-${n}`,
          status: "completed",
          items: [
            {
              type: "userMessage",
              id: `user-${n}`,
              content: [{ type: "text", text: "Existing discussion" }],
            },
          ],
        },
      ]
    : [],
});
let board: LiveBoardSnapshot;
let threads: ReturnType<typeof thread>[];
let created: number;
let posts: string[];
let failLink: boolean;
class Stream {
  static streams: Stream[] = [];
  onmessage?: (message: { data: string }) => void;
  close = vi.fn();
  constructor(readonly url: string) {
    Stream.streams.push(this);
  }
}
const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
const mount = () =>
  render(
    <PreferencesProvider>
      <App />
    </PreferencesProvider>,
  );
beforeEach(() => {
  created = 0;
  posts = [];
  failLink = false;
  threads = [thread(90, true)];
  Stream.streams = [];
  board = { cards: [card], tags: [], version: chatId(100), taskChats: [] };
  history.replaceState(null, "", "/tasks");
  document.documentElement.lang = "en";
  localStorage.setItem(
    "amazi-operations-preferences",
    JSON.stringify({ locale: "en", theme: "dark" }),
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("EventSource", Stream);
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(path);
      if (path === "/api/session")
        return json({
          id: "00000000-0000-5000-8000-000000000001",
          name: "Admin",
          email: "admin@example.test",
          role: "admin",
        });
      if (path === "/api/board") return json(board);
      if (path === `/api/board/cards/${card.id}/events`) return json([]);
      if (path === `/api/board/cards/${card.id}` && init?.method === "POST") {
        const input = JSON.parse(init.body as string) as Partial<Task>;
        const updated = {
          ...board.cards[0]!,
          ...input,
          revision: board.cards[0]!.revision + 1,
        };
        board = { ...board, cards: [updated] };
        return json(updated);
      }
      if (path === "/api/status") return json(status);
      if (path.endsWith("/controls")) return json({ model: "native", models: [] });
      if (path === "/api/chats") {
        if (init?.method !== "POST") return json(threads);
        const next = thread(++created);
        threads.push(next);
        return json(next);
      }
      if (path === "/api/confirmations")
        return json({
          id: chatId(200),
          expiresAt: Date.now() + 300_000,
          resendAt: Date.now() + 30_000,
          telegramUrl: "https://t.me/test",
        });
      if (path.endsWith("/cancel")) return Promise.resolve(new Response(null, { status: 204 }));
      if (path.endsWith("/messages")) {
        const current = threads.find((item) => path.includes(item.id))!;
        current.turns = thread(created, true).turns;
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      if (path === `/api/board/cards/${card.id}/chats`) {
        if (failLink) {
          failLink = false;
          return json({ error: "The Codex worker is unavailable." }, 503);
        }
        const { chatId: id } = JSON.parse(init?.body as string) as { chatId: string };
        const link = {
          taskId: card.id,
          taskTitle: card.title,
          chatId: id,
          createdAt: card.createdAt,
        };
        board = { ...board, version: crypto.randomUUID(), taskChats: [link] };
        const version = board.version;
        setTimeout(
          () =>
            Stream.streams
              .filter((stream) => stream.url === "/api/board/events")
              .forEach((stream) => stream.onmessage?.({ data: JSON.stringify({ version }) })),
          0,
        );
        return json(link);
      }
      if (path.startsWith("/api/snapshot")) {
        const query = new URL(path, "https://test.local").searchParams;
        const selected = query.get("chatId");
        const linked = board.taskChats!.find((link) => link.chatId === selected);
        if (query.has("taskId") && selected && !linked)
          return json({ error: "This conversation is not linked to this task." }, 409);
        const scope = query.get("scope") ?? (linked ? "tasks" : "general");
        const linkedIds = new Set(board.taskChats!.map((link) => link.chatId));
        return json({
          chats: threads.filter(
            (item) => (scope === "tasks" || query.has("taskId")) === linkedIds.has(item.id),
          ),
          detail: threads.find((item) => item.id === selected) ?? null,
          status,
          cursor: 0,
          requests: [],
          linkedTask: linked ? card : null,
          taskChats: board.taskChats,
          chatScope: scope,
        });
      }
      throw Error(`Unexpected request: ${path}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.lang = "ru";
});

const openDraft = async () => {
  fireEvent.click(
    await screen.findByRole("link", { name: `Discuss task with agent: ${card.title}` }),
  );
  await waitFor(() =>
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Message" }).disabled).toBe(
      false,
    ),
  );
};
const confirm = async () => {
  fireEvent.change(await screen.findByRole("textbox", { name: "Confirmation code" }), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
};

it("opens an ID-less draft, waits for confirmed input, reuses its single link and can choose any existing chat", async () => {
  let view = mount();
  await openDraft();
  expect(location.pathname + location.search).toBe(`/tasks?task=${card.id}`);
  expect(posts).toEqual([]);
  expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Message" }).value).toBe("");
  expect(screen.getByRole("region", { name: "Task context" }).textContent).toContain(card.id);
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Let's discuss" },
  });
  expect(screen.getByText("Not assessed yet")).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "Conversations" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("dialog", { name: "Confirm in Telegram" });
  expect(created).toBe(1);
  expect(board.taskChats).toEqual([]);
  const creation = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/chats")!;
  expect(JSON.parse(creation[1]!.body as string)).toEqual({ taskId: card.id });
  expect(location.pathname + location.search).not.toContain("chat=");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await confirm();
  await screen.findByRole("heading", { name: "Task conversation 1" });
  expect(created).toBe(1);
  expect(board.taskChats).toHaveLength(1);
  const calls = vi.mocked(fetch).mock.calls;
  const challenge = calls.find(([url]) => url === "/api/confirmations")!;
  const message = calls.find(([url]) => typeof url === "string" && url.endsWith("/messages"))!;
  const confirmed = JSON.parse(challenge[1]!.body as string) as {
    input: { text: string; taskId: string };
  };
  const sent = JSON.parse(message[1]!.body as string) as { text: string; taskId: string };
  expect(confirmed.input.text).toBe(`${taskContextText(card, en)}\n\nLet's discuss`);
  expect(sent.text).toBe(confirmed.input.text);
  expect(confirmed.input.taskId).toBe(card.id);
  expect(sent.taskId).toBe(card.id);
  expect(location.pathname + location.search).toBe(`/tasks?task=${card.id}&chat=${chatId(1)}`);
  view.unmount();
  view = mount();
  await screen.findByRole("heading", { name: "Task conversation 1" });
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  await screen.findByRole("heading", { name: "New conversation" });
  expect(location.pathname + location.search).toBe(`/tasks?task=${card.id}&new=1`);
  expect(created).toBe(1);
  expect(board.taskChats?.[0]?.chatId).toBe(chatId(1));
  fireEvent.click(screen.getByRole("button", { name: "Choose existing chat" }));
  fireEvent.click(await screen.findByRole("button", { name: "General CLI conversation" }));
  await screen.findByRole("heading", { name: "General CLI conversation" });
  expect(board.taskChats?.map((link) => link.chatId)).toEqual([chatId(90)]);
  expect(threads.some((item) => item.id === chatId(1))).toBe(true);
  fireEvent.click(screen.getByRole("link", { name: "Back to board" }));
  fireEvent.click(
    await screen.findByRole("link", { name: `Discuss task with agent: ${card.title}` }),
  );
  await screen.findByRole("heading", { name: "General CLI conversation" });
  expect(posts.filter((path) => path.endsWith("/messages"))).toHaveLength(1);
  view.unmount();
});

it("retries a failed link after accepted input without replaying the message", async () => {
  mount();
  await openDraft();
  failLink = true;
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Let's discuss" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await confirm();
  await screen.findByRole("alert");
  expect(location.pathname + location.search).not.toContain("chat=");
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("heading", { name: "Task conversation 1" });
  expect(posts.filter((path) => path.endsWith("/messages"))).toHaveLength(1);
  expect(posts.filter((path) => path === "/api/confirmations")).toHaveLength(1);
});

it("opens and edits the task in the shared dialog without leaving the chat or losing its draft", async () => {
  mount();
  await openDraft();
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "Keep my discussion draft" } });
  const hash = location.pathname + location.search;
  fireEvent.click(screen.getByRole("button", { name: "Open task" }));
  await screen.findByRole("dialog", { name: "View task" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(await screen.findByLabelText(/Title/), {
    target: { value: "Updated latency task" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", { name: "Updated latency task" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Message" })).toBe(input);
  expect(input.value).toBe("Keep my discussion draft");
  expect(location.pathname + location.search).toBe(hash);
  expect(posts).toEqual([`/api/board/cards/${card.id}`]);
  fireEvent.click(screen.getByRole("button", { name: "Open task" }));
  await screen.findByRole("dialog", { name: "View task" });
  fireEvent.click(screen.getByRole("button", { name: "Close window" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(input.value).toBe("Keep my discussion draft");
});

it("removes a stale unlinked chat ID from the task URL without creating a chat", async () => {
  history.replaceState(null, "", `/tasks?task=${card.id}&chat=${chatId(42)}`);
  mount();
  await waitFor(() =>
    expect(location.pathname + location.search).toBe(`/tasks?task=${card.id}`),
  );
  await waitFor(() =>
    expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Message" }).disabled).toBe(
      false,
    ),
  );
  expect(posts).toEqual([]);
});

it("shows a reverse task link and filters general/task chats with browser navigation", async () => {
  threads.push(thread(1, true));
  board.taskChats = [
    { taskId: card.id, taskTitle: card.title, chatId: chatId(1), createdAt: card.createdAt },
  ];
  history.replaceState(null, "", `/agent?chat=${chatId(1)}`);
  mount();
  expect(
    (
      await screen.findByRole("link", { name: `Linked task: ${card.title} · Open task` })
    ).getAttribute("href"),
  ).toBe(`/tasks?task=${card.id}&chat=${chatId(1)}`);
  expect(screen.getByRole("button", { name: "Tasks" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "General" }));
  await screen.findByRole("heading", { name: "General CLI conversation" });
  expect(screen.queryByRole("button", { name: "Task conversation 1" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
  await screen.findByRole("heading", { name: "Task conversation 1" });
  act(() => history.back());
  await screen.findByRole("heading", { name: "General CLI conversation" });
});
