// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Task } from "@/features/board/data/task-data";

import { TaskCard } from "./task-card";

const task: Task = {
  archivedAt: null,
  attachments: [],
  createdAt: "2026-09-29T00:00:00.000Z",
  description: null,
  id: "task-1",
  order: 0,
  priority: "medium",
  status: "queue",
  tags: [],
  title: "Проверка перетаскивания",
  updatedAt: "2026-09-29T00:00:00.000Z",
};

afterEach(cleanup);

describe("TaskCard drag handle", () => {
  it("keeps the drag handle visible and disables it while a move is saving", () => {
    render(<TaskCard dragDisabled dragHandleRef={() => {}} task={task} />);

    const handle = screen.getByRole("button", {
      name: "Переместить задачу: Проверка перетаскивания",
    });
    expect(handle).toBeTruthy();
    expect((handle as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables the drag handle when the board is ready", () => {
    render(<TaskCard dragHandleRef={() => {}} task={task} />);

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Переместить задачу: Проверка перетаскивания",
      }).disabled,
    ).toBe(false);
  });

  it.each([false, true])("renders tags with attachments=%s", (withAttachment) => {
    render(
      <TaskCard
        task={{
          ...task,
          tags: [{ id: "tag", name: "Frontend", tone: "blue" }],
          attachments: withAttachment ? [{ id: "file", name: "file.txt", size: 1 }] : [],
        }}
      />,
    );
    expect(screen.getByText("Frontend")).toBeTruthy();
    if (withAttachment) expect(screen.getByLabelText("1 вложений")).toBeTruthy();
  });
});
