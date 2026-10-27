// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Task } from "@contracts/board.js";
import type { TaskComment } from "@contracts/task-comments.js";
import { TaskComments } from "./TaskComments";
import { addTaskComment, getTaskComments } from "./comment-api";
import { trackerBoardQuery } from "../data/tracker-query";
vi.mock("./comment-api", () => ({ addTaskComment: vi.fn(), getTaskComments: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains failed drafts/files and refreshes comments after a live board revision without resetting the next draft", async () => {
  document.documentElement.lang = "en";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ cards: [{ id: "task", revision: 2 }], tags: [] })),
      ),
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
  client.setQueryData(trackerBoardQuery.queryKey, {
    cards: [{ id: "task", revision: 1 } as Task],
    tags: [],
    columns: [],
    dividers: [],
    version: "v1",
  });
  render(
    <QueryClientProvider client={client}>
      <TaskComments cardId="task" />
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
    client.setQueryData(trackerBoardQuery.queryKey, {
      cards: [{ id: "task", revision: 3 } as Task],
      tags: [],
      columns: [],
      dividers: [],
      version: "v3",
    });
  });
  await screen.findByText("Remote comment");
  expect(input.value).toBe("Next comment");
  client.clear();
});
