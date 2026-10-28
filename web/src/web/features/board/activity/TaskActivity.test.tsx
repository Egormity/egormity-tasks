// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Task } from "@contracts/board.js";
import type { TaskComment } from "@contracts/task-comments.js";
import type { TrackerEvent } from "../data/task-data";
import { TaskActivity } from "./TaskActivity";
import { addTaskComment, getTaskComments } from "../comments/comment-api";
import { trackerBoardQuery } from "../data/tracker-query";

vi.mock("../comments/comment-api", () => ({
  addTaskComment: vi.fn(),
  getTaskComments: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "ru";
});

const boardSnapshot = (revision: number) => ({
  cards: [{ id: "task", revision } as Task],
  tags: [],
  columns: [],
  dividers: [],
  version: `v${revision}`,
});

it("retains failed drafts/files and refreshes comments after a live board revision without resetting the next draft", async () => {
  document.documentElement.lang = "en";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(boardSnapshot(2)))),
  );
  const comments: TaskComment[] = [];
  vi.mocked(getTaskComments).mockImplementation(() => Promise.resolve([...comments]));
  vi.mocked(addTaskComment)
    .mockRejectedValueOnce(new Error("Network failed"))
    .mockImplementationOnce((_cardId, id, text) => {
      const comment = {
        id,
        cardId: "task",
        text,
        createdAt: "2026-10-13T00:00:00Z",
        author: { id: "admin", name: "Admin" },
        attachments: [],
      };
      comments.push(comment);
      return Promise.resolve(comment);
    });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(trackerBoardQuery.queryKey, boardSnapshot(1));
  render(
    <QueryClientProvider client={client}>
      <TaskActivity cardId="task" columns={[]} events={[]} />
    </QueryClientProvider>,
  );
  await screen.findByText("No comments yet");
  const input = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Comment" });
  fireEvent.change(input, { target: { value: "My clarification" } });
  const file = new File(["reference"], "note.txt", { type: "text/plain" });
  fireEvent.paste(input, { clipboardData: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
  await screen.findByRole("alert");
  expect(input.value).toBe("My clarification");
  expect(screen.getByText("note.txt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Send comment" }));
  await waitFor(() => expect(input.value).toBe(""));
  expect(addTaskComment).toHaveBeenNthCalledWith(
    2,
    "task",
    vi.mocked(addTaskComment).mock.calls[0]![1],
    "My clarification",
    [file],
  );
  await screen.findByText("My clarification");
  await waitFor(() => expect(input.disabled).toBe(false));
  fireEvent.change(input, { target: { value: "Next comment" } });
  comments.push({ ...comments[0]!, id: "other", text: "Remote comment" });
  act(() => {
    client.setQueryData(trackerBoardQuery.queryKey, boardSnapshot(3));
  });
  await screen.findByText("Remote comment");
  expect(input.value).toBe("Next comment");
  client.clear();
});

it("merges history with comments into one feed and can show history alone", async () => {
  document.documentElement.lang = "en";
  vi.mocked(getTaskComments).mockResolvedValue([
    {
      id: "comment",
      cardId: "task",
      text: "Comment text",
      createdAt: "2026-10-28T10:00:00.000Z",
      author: { id: "admin", name: "Admin" },
      attachments: [],
    },
  ]);
  const events: readonly TrackerEvent[] = [
    { id: "event", type: "created", createdAt: "2026-10-28T09:00:00.000Z", payload: {} },
    {
      id: "comment-event",
      type: "comment_added",
      createdAt: "2026-10-28T10:00:00.000Z",
      payload: {},
    },
  ];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(trackerBoardQuery.queryKey, boardSnapshot(1));
  render(
    <QueryClientProvider client={client}>
      <TaskActivity cardId="task" columns={[]} events={events} />
    </QueryClientProvider>,
  );

  await screen.findByText("Comment text");
  expect(screen.queryByText("Task created")).toBeNull();
  const commentsToggle = screen.getByRole("button", { name: /Comments/ });
  const historyToggle = screen.getByRole("button", { name: /History/ });
  expect(commentsToggle.getAttribute("aria-pressed")).toBe("true");
  expect(historyToggle.getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(historyToggle);
  await screen.findByText("Task created");
  expect(screen.queryByText("Comment added")).toBeNull();
  const feed = screen.getByRole("list", { name: "Activity feed" });
  const feedText = feed.textContent ?? "";
  expect(feedText.indexOf("Task created")).toBeGreaterThan(-1);
  expect(feedText.indexOf("Task created")).toBeLessThan(feedText.indexOf("Comment text"));

  fireEvent.click(commentsToggle);
  expect(screen.queryByText("Comment text")).toBeNull();
  expect(screen.getByText("Comment added")).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();

  fireEvent.click(historyToggle);
  expect(screen.getByText("Turn on Comments or History to see activity.")).toBeTruthy();
  client.clear();
});
