// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { BoardColumn, Task } from "@/features/board/data/task-data";
import { TaskEditorModal } from "./task-editor-modal";

const task: Task = {
  id: "task",
  revision: 1,
  title: "Original task",
  description: "Original description",
  status: "queue",
  priority: "medium",
  order: 0,
  archivedAt: null,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
  attachments: [],
  tags: [],
};
afterEach(() => {
  cleanup();
  document.documentElement.lang = "ru";
});

it("keeps the original separate read and edit views, saving title and description with selected tags", async () => {
  document.documentElement.lang = "en";
  const onSave = vi.fn();
  const onRequestEdit = vi.fn();
  const client = new QueryClient();
  const props = {
    task,
    events: [],
    tags: [{ id: "tag", name: "Platform", tone: "blue" as const, usageCount: 0 }],
    onOpenChange: vi.fn(),
    onCreateTag: vi.fn(),
    onDeleteTag: vi.fn(),
    onUpdateTag: vi.fn(),
    onRequestEdit,
    onSave,
    open: true,
  };
  const view = render(
    <QueryClientProvider client={client}>
      <TaskEditorModal {...props} mode="view" />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("dialog").textContent).toContain("View task");
  expect(screen.getByRole("heading", { name: "Original task" })).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Comment" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: /Title/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(onRequestEdit).toHaveBeenCalledOnce();
  view.rerender(
    <QueryClientProvider client={client}>
      <TaskEditorModal {...props} key="edit" mode="edit" />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Task description").textContent).toBe("Original description"),
  );
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Updated task" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select tag Platform" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Updated task",
      description: "Original description",
      tagIds: ["tag"],
    }),
  );
  client.clear();
});

it("defaults new tasks to Backlog and saves the selected column", () => {
  document.documentElement.lang = "en";
  const onSave = vi.fn();
  const client = new QueryClient();
  const columns: readonly BoardColumn[] = [
    { id: "backlog", label: "Backlog", accent: "#b9bfca" },
    { id: "customStage", label: "Custom stage", accent: "#123456" },
  ];
  render(
    <QueryClientProvider client={client}>
      <TaskEditorModal
        columns={columns}
        events={[]}
        mode="create"
        onOpenChange={vi.fn()}
        onCreateTag={vi.fn()}
        onDeleteTag={vi.fn()}
        onUpdateTag={vi.fn()}
        onSave={onSave}
        open
        tags={[]}
      />
    </QueryClientProvider>,
  );

  const status = screen.getByRole("combobox", { name: "Column" });
  expect(status).toHaveProperty("value", "backlog");
  fireEvent.change(status, { target: { value: "customStage" } });
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "New task" } });
  fireEvent.click(screen.getByRole("button", { name: "Create task" }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ status: "customStage" }));
  client.clear();
});
