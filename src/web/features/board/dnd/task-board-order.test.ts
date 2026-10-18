import { describe, expect, it } from "vitest";

import {
  getFullColumnDropTarget,
  getKeyboardDropTarget,
  getOrderedColumnTasks,
  moveBoardTask,
} from "./task-board-order";
import type { Task, TaskStatus } from "@/features/board/data/task-data";

const card = (id: string, status: TaskStatus, order: number): Task => ({
  id,
  title: id,
  status,
  order,
  revision: 1,
  archivedAt: null,
  attachments: [],
  tags: [],
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
  description: null,
  priority: "medium",
});

const tasks = [
  card("a", "queue", 0),
  card("b", "queue", 1),
  card("c", "queue", 2),
  card("x", "review", 0),
  card("y", "review", 1),
];

const ids = (tasks: readonly Task[], status: TaskStatus) =>
  getOrderedColumnTasks(tasks, status).map((task) => task.id);

describe("board insertion order", () => {
  it("moves up, down, across columns and into an empty column without losing cards", () => {
    expect(ids(moveBoardTask(tasks, "c", { status: "queue", beforeId: "a" }), "queue")).toEqual(
      ["c", "a", "b"],
    );
    expect(
      ids(moveBoardTask(tasks, "a", { status: "queue", beforeId: null }), "queue"),
    ).toEqual(["b", "c", "a"]);
    const moved = moveBoardTask(tasks, "a", { status: "review", beforeId: "y" });
    expect(ids(moved, "queue")).toEqual(["b", "c"]);
    expect(ids(moved, "review")).toEqual(["x", "a", "y"]);
    expect(getOrderedColumnTasks(moved, "review").map((task) => task.order)).toEqual([0, 1, 2]);
    expect(ids(moveBoardTask(tasks, "a", { status: "done", beforeId: null }), "done")).toEqual([
      "a",
    ]);
    expect(moved).toHaveLength(tasks.length);
  });

  it("does not save the unchanged position or an invalid destination", () => {
    expect(moveBoardTask(tasks, "a", { status: "queue", beforeId: "b" })).toBe(tasks);
    expect(moveBoardTask(tasks, "c", { status: "queue", beforeId: null })).toBe(tasks);
    expect(moveBoardTask(tasks, "a", { status: "review", beforeId: "missing" })).toBe(tasks);
  });

  it("uses deterministic order for imported duplicate indices", () => {
    const duplicates = [
      card("b", "queue", 0),
      card("a", "queue", 0),
      { ...card("c", "queue", 0), createdAt: "2026-10-12T00:00:00.000Z" },
    ];
    expect(ids(duplicates, "queue")).toEqual(["c", "a", "b"]);
    expect(
      ids(moveBoardTask(duplicates, "c", { status: "queue", beforeId: "b" }), "queue"),
    ).toEqual(["a", "c", "b"]);
  });

  it("preserves hidden siblings when inserting between or after search results", () => {
    const all = [...tasks, card("hidden", "review", 2)];
    expect(
      getFullColumnDropTarget(tasks, all, "a", { status: "review", beforeId: "y" }),
    ).toEqual({
      status: "review",
      beforeId: "y",
    });
    expect(
      getFullColumnDropTarget(tasks, all, "a", { status: "review", beforeId: null }),
    ).toEqual({
      status: "review",
      beforeId: "hidden",
    });
    expect(
      getFullColumnDropTarget(
        tasks.filter((task) => task.status !== "review"),
        all,
        "a",
        { status: "review", beforeId: null },
      ),
    ).toEqual({ status: "review", beforeId: null });
  });

  it("steps the keyboard insertion slot and clamps at column boundaries", () => {
    const start = { status: "queue", beforeId: "b" } as const;
    const down = getKeyboardDropTarget(tasks, "a", start, { x: 0, y: 10 });
    expect(down).toEqual({ status: "queue", beforeId: "c" });
    expect(getKeyboardDropTarget(tasks, "a", down, { x: 0, y: -10 })).toEqual(start);
    expect(getKeyboardDropTarget(tasks, "a", start, { x: 10, y: 0 })).toEqual({
      status: "inProgress",
      beforeId: null,
    });
    expect(getKeyboardDropTarget(tasks, "a", start, { x: 0, y: -10 })).toEqual(start);
  });
});
