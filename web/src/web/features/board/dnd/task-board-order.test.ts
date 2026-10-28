import { describe, expect, it } from "vitest";

import {
  getFullColumnDropTarget,
  getKeyboardDropTarget,
  getOrderedColumnItems,
  getOrderedColumnTasks,
  moveBoardItem,
  moveBoardTask,
} from "./task-board-order";
import { boardColumns, type Task, type TaskStatus } from "@/features/board/data/task-data";
import type { BoardDivider } from "@contracts/board-columns.js";

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

const dividers: BoardDivider[] = [];
const movedTasks = (items: readonly Task[], status: TaskStatus) => ids(items, status);

describe("board insertion order", () => {
  it("moves up, down, across columns and into an empty column without losing cards", () => {
    expect(
      movedTasks(
        moveBoardTask(tasks, dividers, "c", { status: "queue", beforeId: "a" }).tasks,
        "queue",
      ),
    ).toEqual(["c", "a", "b"]);
    expect(
      movedTasks(
        moveBoardTask(tasks, dividers, "a", { status: "queue", beforeId: null }).tasks,
        "queue",
      ),
    ).toEqual(["b", "c", "a"]);
    const moved = moveBoardTask(tasks, dividers, "a", { status: "review", beforeId: "y" });
    expect(ids(moved.tasks, "queue")).toEqual(["b", "c"]);
    expect(ids(moved.tasks, "review")).toEqual(["x", "a", "y"]);
    expect(getOrderedColumnTasks(moved.tasks, "review").map((task) => task.order)).toEqual([
      0, 1, 2,
    ]);
    expect(
      ids(
        moveBoardTask(tasks, dividers, "a", { status: "done", beforeId: null }).tasks,
        "done",
      ),
    ).toEqual(["a"]);
    expect(moved.tasks).toHaveLength(tasks.length);
  });

  it("does not save the unchanged position or an invalid destination", () => {
    expect(moveBoardTask(tasks, dividers, "a", { status: "queue", beforeId: "b" }).tasks).toBe(
      tasks,
    );
    expect(moveBoardTask(tasks, dividers, "c", { status: "queue", beforeId: null }).tasks).toBe(
      tasks,
    );
    expect(
      moveBoardTask(tasks, dividers, "a", { status: "review", beforeId: "missing" }).tasks,
    ).toBe(tasks);
  });

  it("treats titled dividers as ordered items and allows cards on either side", () => {
    const mixedTasks = tasks.map((task) =>
      task.status === "queue"
        ? { ...task, order: task.id === "a" ? 0 : task.id === "b" ? 2 : 3 }
        : task,
    );
    const divider: BoardDivider = {
      id: "section",
      title: "Ready for release",
      columnId: "queue",
      order: 1,
    };
    expect(
      getOrderedColumnItems(mixedTasks, [divider], "queue").map((item) => item.id),
    ).toEqual(["a", "section", "b", "c"]);
    const moved = moveBoardTask(mixedTasks, [divider], "c", {
      status: "queue",
      beforeId: divider.id,
    });
    expect(
      getOrderedColumnItems(moved.tasks, moved.dividers, "queue").map((item) => item.id),
    ).toEqual(["a", "c", "section", "b"]);
    expect(moved.dividers[0]?.order).toBe(2);
    expect(getOrderedColumnTasks(moved.tasks, "queue").map(({ id }) => id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("moves a divider within and between columns while reindexing the mixed sequence", () => {
    const interleavedTasks = tasks.map((task) =>
      task.status === "queue"
        ? { ...task, order: task.id === "a" ? 0 : task.id === "b" ? 2 : 3 }
        : task,
    );
    const section: BoardDivider = {
      id: "section",
      title: "Ready for release",
      columnId: "queue",
      order: 1,
    };
    const withinColumn = moveBoardItem(interleavedTasks, [section], section.id, {
      status: "queue",
      beforeId: "c",
    });
    expect(
      getOrderedColumnItems(withinColumn.tasks, withinColumn.dividers, "queue").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b", "section", "c"]);
    expect(withinColumn.dividers[0]).toMatchObject({ columnId: "queue", order: 2 });

    const acrossColumns = moveBoardItem(interleavedTasks, [section], section.id, {
      status: "review",
      beforeId: "y",
    });
    expect(
      getOrderedColumnItems(acrossColumns.tasks, acrossColumns.dividers, "queue").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b", "c"]);
    expect(
      getOrderedColumnItems(acrossColumns.tasks, acrossColumns.dividers, "review").map(
        (item) => item.id,
      ),
    ).toEqual(["x", "section", "y"]);
    expect(acrossColumns.dividers[0]).toMatchObject({ columnId: "review", order: 1 });
    expect(acrossColumns.tasks.find(({ id }) => id === "y")?.order).toBe(2);
  });

  it("includes user-defined columns in drag and keyboard destinations", () => {
    const columns = [
      ...boardColumns.slice(0, 5),
      { id: "custom", label: "Custom", accent: "#123456" },
      ...boardColumns.slice(5),
    ];
    expect(
      ids(
        moveBoardTask(tasks, dividers, "a", { status: "custom", beforeId: null }, columns)
          .tasks,
        "custom",
      ),
    ).toEqual(["a"]);
    expect(
      getKeyboardDropTarget(
        tasks,
        dividers,
        "a",
        { status: "review", beforeId: null },
        { x: 1, y: 0 },
        columns,
      ),
    ).toEqual({ status: "custom", beforeId: null });
  });

  it("uses deterministic order for imported duplicate indices", () => {
    const duplicates = [
      card("b", "queue", 0),
      card("a", "queue", 0),
      { ...card("c", "queue", 0), createdAt: "2026-10-12T00:00:00.000Z" },
    ];
    expect(ids(duplicates, "queue")).toEqual(["c", "a", "b"]);
    expect(
      ids(
        moveBoardTask(duplicates, dividers, "c", { status: "queue", beforeId: "b" }).tasks,
        "queue",
      ),
    ).toEqual(["a", "c", "b"]);
  });

  it("preserves hidden siblings when inserting between or after search results", () => {
    const all = [...tasks, card("hidden", "review", 2)];
    expect(
      getFullColumnDropTarget(tasks, all, "a", { status: "review", beforeId: "y" }, dividers),
    ).toEqual({
      status: "review",
      beforeId: "y",
    });
    expect(
      getFullColumnDropTarget(tasks, all, "a", { status: "review", beforeId: null }, dividers),
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
        dividers,
      ),
    ).toEqual({ status: "review", beforeId: null });
  });

  it("steps the keyboard insertion slot and clamps at column boundaries", () => {
    const start = { status: "queue", beforeId: "b" } as const;
    const down = getKeyboardDropTarget(tasks, dividers, "a", start, { x: 0, y: 10 });
    expect(down).toEqual({ status: "queue", beforeId: "c" });
    expect(getKeyboardDropTarget(tasks, dividers, "a", down, { x: 0, y: -10 })).toEqual(start);
    expect(getKeyboardDropTarget(tasks, dividers, "a", start, { x: 10, y: 0 })).toEqual({
      status: "inProgress",
      beforeId: null,
    });
    expect(getKeyboardDropTarget(tasks, dividers, "a", start, { x: 0, y: -10 })).toEqual(start);
  });
});
