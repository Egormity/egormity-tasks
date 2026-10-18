// @vitest-environment jsdom
import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { LiveBoardSnapshot } from "@contracts/board.js";
import { resetTrackerState } from "./tracker-api";
import {
  useTrackerCards,
  useTrackerEvents,
  useTrackerTags,
  useUpdateTrackerCard,
} from "./tracker-hooks";
import { createBoardQueryClient } from "./tracker-query";
import { useBoardEvents } from "./use-board-events";
import { useTaskAttachment } from "@/features/board/attachments/use-task-attachment";

const version = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

class Stream {
  static CLOSED = 2;
  static current: Stream;
  readyState = 1;
  onmessage?: (message: { data: string }) => void;
  onerror?: () => void;
  close = vi.fn();
  constructor(readonly url: string) {
    Stream.current = this;
  }
  change(next: string) {
    this.onmessage?.({ data: JSON.stringify({ version: next }) });
  }
}

let board: LiveBoardSnapshot;
let history: unknown[];
const onError = vi.fn();
let client: ReturnType<typeof createBoardQueryClient>;
let respond: (path: string, init?: RequestInit) => Promise<Response>;
const request = vi.fn((path: string, init?: RequestInit) => respond(path, init));
const count = (path: string) => request.mock.calls.filter(([url]) => url === path).length;
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const advance = (ms = 100) => act(() => vi.advanceTimersByTimeAsync(ms));
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const mount = () =>
  renderHook(
    ({ search, scope }: { search: string; scope: "active" | "archived" }) => {
      useBoardEvents(client);
      const cards = useTrackerCards(scope, search);
      const allCards = useTrackerCards("active", "");
      const tags = useTrackerTags();
      const events = useTrackerEvents("card");
      const image = useTaskAttachment(allCards.data?.items[0]?.attachments[0], "card");
      const save = useUpdateTrackerCard();
      return { cards, allCards, tags, events, image, save };
    },
    { wrapper, initialProps: { search: "", scope: "active" as "active" | "archived" } },
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", Stream);
  vi.stubGlobal("fetch", request);
  focusManager.setFocused(true);
  client = createBoardQueryClient(onError);
  board = {
    version: version(1),
    tags: [{ id: "tag", name: "Frontend", tone: "blue" }],
    cards: [
      {
        id: "card",
        title: "Image preview",
        description: null,
        priority: "medium",
        status: "backlog",
        order: 0,
        revision: 1,
        tagIds: ["tag"],
        archivedAt: null,
        createdAt: "2026-10-12T00:00:00Z",
        updatedAt: "2026-10-12T00:00:00Z",
        attachments: [
          {
            id: "image",
            name: "image.png",
            size: 5,
            type: "image/png",
            sha256: "a".repeat(64),
          },
        ],
      },
    ],
  };
  history = [];
  respond = (path, init) => {
    if (path === "/api/board") return Promise.resolve(json(board));
    if (path.endsWith("/events")) return Promise.resolve(json(history));
    if (path.endsWith("/attachments/image")) return Promise.resolve(new Response("image"));
    if (path.endsWith("/cards/card") && init?.method === "POST") {
      board = {
        ...board,
        version: version(2),
        cards: [{ ...board.cards[0]!, revision: 2, title: "Saved" }],
      };
      Stream.current.change(board.version);
      return Promise.resolve(json(board.cards[0]));
    }
    throw Error(`Unexpected request: ${path}`);
  };
});

afterEach(() => {
  cleanup();
  client.clear();
  resetTrackerState();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shares one snapshot across search, archive and tags, with no idle or attachment polling", async () => {
  const view = mount();
  await advance();
  expect(view.result.current.cards.data?.items).toHaveLength(1);
  expect(view.result.current.tags.data?.items[0]?.usageCount).toBe(1);
  expect(view.result.current.image.blob).toBeTruthy();
  expect(count("/api/board")).toBe(1);
  act(() => Stream.current.change(board.version));
  view.rerender({ scope: "active", search: "Frontend" });
  await advance();
  expect(view.result.current.cards.data?.items).toHaveLength(1);
  view.rerender({ scope: "archived", search: "" });
  await advance();
  expect(view.result.current.cards.data?.items).toHaveLength(0);
  // Reconnection at the same version and window focus do not refetch unchanged data.
  act(() => {
    Stream.current.change(board.version);
    focusManager.setFocused(false);
  });
  await advance(60_000);
  act(() => focusManager.setFocused(true));
  await advance(60_000);
  expect(count("/api/board")).toBe(1);
  expect(count("/api/board/cards/card/events")).toBe(1);
  expect(count("/api/board/cards/card/attachments/image")).toBe(1);
  view.unmount();
  expect(Stream.current.close).toHaveBeenCalledOnce();
});

it("refreshes all board views and only the changed card history after SSE, retaining its image", async () => {
  const view = mount();
  await advance();
  const blob = view.result.current.image.blob;
  board = { ...board, version: version(2), tags: [{ ...board.tags[0]!, name: "UI" }] };
  act(() => Stream.current.change(board.version));
  await advance();
  expect(view.result.current.tags.data?.items[0]?.name).toBe("UI");
  expect(count("/api/board/cards/card/events")).toBe(1);
  board = {
    ...board,
    version: version(3),
    cards: [{ ...board.cards[0]!, revision: 2, title: "Changed" }],
  };
  history = [
    { id: "event", type: "content_changed", payload: {}, createdAt: board.cards[0]!.updatedAt },
  ];
  act(() => Stream.current.change(board.version));
  await advance();
  expect(view.result.current.cards.data?.items[0]?.title).toBe("Changed");
  expect(view.result.current.events.data?.items).toHaveLength(1);
  expect(count("/api/board")).toBe(3);
  expect(count("/api/board/cards/card/events")).toBe(2);
  expect(view.result.current.image.blob).toBe(blob);
  expect(count("/api/board/cards/card/attachments/image")).toBe(1);
});

it("coalesces local save and SSE notifications and waits for the refreshed board", async () => {
  const view = mount();
  await advance();
  let saved: Promise<unknown>;
  act(() => {
    saved = view.result.current.save.mutateAsync({
      id: "card",
      input: { revision: 1, title: "Saved" },
    });
  });
  await advance();
  await act(() => saved!);
  expect(view.result.current.cards.data?.items[0]?.title).toBe("Saved");
  expect(count("/api/board")).toBe(2);
  expect(count("/api/board/cards/card/attachments/image")).toBe(1);
});

it("does not lose an SSE change arriving during an in-flight snapshot read", async () => {
  const view = mount();
  await advance();
  const normal = respond;
  let release: ((value: Response) => void) | undefined;
  respond = (path, init) =>
    path === "/api/board"
      ? new Promise((resolve) => {
          release = resolve;
        })
      : normal(path, init);
  board = { ...board, version: version(2) };
  act(() => Stream.current.change(board.version));
  await advance();
  const earlier = json(board);
  board = {
    ...board,
    version: version(3),
    cards: [{ ...board.cards[0]!, revision: 2, title: "Latest" }],
  };
  act(() => Stream.current.change(board.version));
  respond = normal;
  act(() => {
    release!(earlier);
  });
  await advance();
  expect(view.result.current.cards.data?.items[0]?.title).toBe("Latest");
  expect(count("/api/board")).toBe(3);
});

it("reports expired sessions when EventSource closes on an authorization failure", async () => {
  mount();
  await advance();
  respond = () =>
    Promise.resolve(new Response(JSON.stringify({ error: "Expired" }), { status: 401 }));
  act(() => {
    Stream.current.readyState = Stream.CLOSED;
    Stream.current.onerror?.();
  });
  await advance();
  expect(onError.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
});
