// @vitest-environment jsdom
import {
  type DragDropManager,
  DragDropProvider,
  DragOverlay,
  useDragDropManager,
} from "@dnd-kit/react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { BoardColumn } from "@/features/board/components/board-column";
import { getOrderedColumnTasks } from "./task-board-order";
import { TaskCard } from "@/features/board/components/task-card";
import { type Task, boardColumns } from "@/features/board/data/task-data";
import type { useUpdateTrackerCard } from "@/features/board/data/tracker-hooks";
import { useBoardDrag } from "./use-board-drag";

const tasks: Task[] = ["a", "b", "c", "x", "y"].map((id, index) => ({
  id,
  title: id,
  status: index < 3 ? "queue" : "review",
  order: index % 3,
  revision: 1,
  archivedAt: null,
  attachments: [],
  tags: [],
  priority: "medium",
  description: null,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
}));

let manager: DragDropManager;

let scrollOffset: number;

const mutate = vi.fn<ReturnType<typeof useUpdateTrackerCard>["mutate"]>();

const ManagerProbe = () => {
  const value = useDragDropManager();
  useLayoutEffect(() => {
    manager = value!;
  }, [value]);
  return null;
};

const Harness = ({ items = tasks }: { readonly items?: Task[] }) => {
  const drag = useBoardDrag(items, items, { mutate, isPending: false });
  return (
    <DragDropProvider
      onBeforeDragStart={drag.handleBeforeDragStart}
      onDragStart={drag.handleDragStart}
      onCollision={drag.handleCollision}
      onDragMove={drag.handleDragMove}
      onDragOver={drag.handleDragOver}
      onDragEnd={drag.handleDragEnd}
    >
      <ManagerProbe />
      <DragOverlay dropAnimation={null}>
        {(source) => <TaskCard isOverlay task={items.find((task) => task.id === source.id)!} />}
      </DragOverlay>
      {boardColumns.map((column) => (
        <BoardColumn
          key={column.id}
          column={column}
          tasks={getOrderedColumnTasks(drag.displayedTasks, column.id)}
          dragDisabled={false}
          insertionBeforeId={
            drag.dropTarget?.status === column.id ? drag.dropTarget.beforeId : undefined
          }
          exportDisabled
          exportTaskCount={0}
          isExporting={false}
          onExportAll={() => {}}
          onOpen={() => {}}
        />
      ))}
    </DragDropProvider>
  );
};

beforeEach(() => {
  mutate.mockReset();
  scrollOffset = 0;
  // jsdom has no layout. Model six columns and mixed-height cards; all DnD events,
  // registry, collision detection, React rendering and keyboard sensors are real.
  const bounds = vi.spyOn(Element.prototype, "getBoundingClientRect");
  bounds.mockImplementation(() => {
    const element = bounds.mock.contexts.at(-1) as Element;
    if (element.id === "board-viewport") return new DOMRect(0, 0, 2000, 250);
    const column = element.closest<HTMLElement>("[data-board-column-id]");
    const index = boardColumns.findIndex((item) => item.id === column?.dataset.boardColumnId);
    if (index < 0) return new DOMRect(0, 0, 2000, 900);
    const left = index * 320;
    const card = element.closest<HTMLElement>("[data-task-card-id]");
    if (!card) return new DOMRect(left, 0, 300, 800);
    const cards = Array.from(column!.querySelectorAll("[data-task-card-id]"));
    const position = cards.indexOf(card);
    const heights = [80, 200, 80];
    const top =
      100 -
      scrollOffset +
      heights.slice(0, position).reduce((sum, height) => sum + height + 12, 0);
    return new DOMRect(left + 12, top, 276, heights[position] ?? 80);
  });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
  document.getAnimations = () => [];
  document.elementFromPoint = (x, y) =>
    Array.from(
      document.querySelectorAll("[data-board-column-id], [data-task-card-id]"),
    ).findLast((element) => {
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    }) ?? document.body;
  Element.prototype.getAnimations = () => [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  manager?.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const interact = async (action: () => void) => {
  await act(async () => {
    action();
    await Promise.resolve();
  });
};

const start = async (id = "a") => {
  await interact(() => {
    manager.actions.start({ source: id, coordinates: { x: 900, y: 120 } });
  });
  expect(manager.dragOperation.status.dragging).toBe(true);
};

const move = async (x: number, y: number) => {
  await interact(() => {
    manager.actions.move({ to: { x, y } });
  });
};

const stop = async (canceled = false) => {
  await interact(() => {
    manager.actions.stop({ canceled });
  });
  await waitFor(() => expect(manager.dragOperation.status.idle).toBe(true));
};

const columnIds = (status: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-board-column-id="${status}"] [data-task-card-id]`,
    ),
  ).map((card) => card.dataset.taskCardId);

const indicator = () => document.querySelector("[data-board-drop-indicator]");

it("updates the insertion slot inside one tall card while hit areas stay stationary", async () => {
  render(<Harness />);
  await start();
  await move(820, 220);
  expect(indicator()?.parentElement?.querySelector("article")?.dataset.taskCardId).toBe("b");
  await move(820, 350);
  expect(indicator()?.parentElement?.querySelector("article")?.dataset.taskCardId).toBe("c");
  expect(columnIds("queue")).toEqual(["a", "b", "c"]);
  await stop();
  expect(mutate).toHaveBeenCalledExactlyOnceWith(
    { id: "a", input: { revision: 1, status: "queue", beforeId: "c" } },
    expect.any(Object),
  );
  expect(columnIds("queue")).toEqual(["b", "a", "c"]);
});

it("places a card at the end of a short column, not the top half of the full-height container", async () => {
  render(<Harness />);
  await start();
  await move(1420, 420);
  await stop();
  expect(mutate.mock.calls[0]?.[0].input).toEqual({
    revision: 1,
    status: "review",
    beforeId: null,
  });
  expect(columnIds("review")).toEqual(["x", "y", "a"]);
});

it("moves a task into the new clarification column before Queue", async () => {
  render(<Harness />);
  await start();
  await move(500, 180);
  await stop();
  expect(mutate.mock.calls[0]?.[0].input).toEqual({
    revision: 1,
    status: "clarification",
    beforeId: null,
  });
  expect(columnIds("clarification")).toEqual(["a"]);
  expect(boardColumns.map((column) => column.id).slice(0, 3)).toEqual([
    "backlog",
    "clarification",
    "queue",
  ]);
});

it("moves to empty columns and ignores background refreshes until the save finishes", async () => {
  const view = render(<Harness />);
  await start();
  view.rerender(
    <Harness items={[{ ...tasks[0]!, order: 8, revision: 2 }, ...tasks.slice(1)]} />,
  );
  expect(columnIds("queue")).toEqual(["a", "b", "c"]);
  await move(1040, 180);
  await stop();
  expect(columnIds("inProgress")).toEqual(["a"]);
  expect(mutate.mock.calls[0]?.[0].input).toEqual({
    revision: 1,
    status: "inProgress",
    beforeId: null,
  });
  await interact(() => {
    manager.actions.start({ source: "b", coordinates: { x: 820, y: 200 } });
  });
  expect(manager.dragOperation.status.idle).toBe(true);
  const [variables, callbacks] = mutate.mock.calls[0]!;
  await interact(() => {
    callbacks?.onError?.(new Error("Conflict"), variables, undefined, {} as never);
  });
  expect(columnIds("inProgress")).toEqual([]);
  expect(columnIds("queue")).toEqual(["b", "c", "a"]);
  await start("b");
  await stop(true);
});

it.each(["outside", "cancel", "unchanged"])("does not save a %s drop", async (mode) => {
  render(<Harness />);
  await start();
  if (mode !== "unchanged") await move(1420, 220);
  if (mode === "outside") await move(1950, 220);
  await stop(mode === "cancel");
  expect(mutate).not.toHaveBeenCalled();
  expect(indicator()).toBeNull();
  expect(columnIds("queue")).toEqual(["a", "b", "c"]);
});

it("supports keyboard start, slot navigation, cancellation and commit through the actual sensor", async () => {
  render(<Harness />);
  const handle = screen.getByRole("button", { name: "Переместить задачу: a" });
  await interact(() => {
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
  });
  expect(manager.dragOperation.status.dragging).toBe(true);
  await interact(() => {
    fireEvent.keyDown(document, { key: "ArrowDown", code: "ArrowDown" });
  });
  expect(indicator()?.parentElement?.querySelector("article")?.dataset.taskCardId).toBe("c");
  await interact(() => {
    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
  });
  expect(
    indicator()?.closest<HTMLElement>("[data-board-column-id]")?.dataset.boardColumnId,
  ).toBe("inProgress");
  await interact(() => {
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
  });
  expect(mutate).not.toHaveBeenCalled();
  expect(columnIds("queue")).toEqual(["a", "b", "c"]);
  await waitFor(() => expect(manager.dragOperation.status.idle).toBe(true));
  await interact(() => {
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
  });
  await interact(() => {
    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
  });
  await interact(() => {
    fireEvent.keyDown(document, { key: "Enter", code: "Enter" });
  });
  expect(mutate.mock.calls[0]?.[0].input).toEqual({
    revision: 1,
    status: "inProgress",
    beforeId: null,
  });
});

it("updates the slot after scrolling and rejects areas clipped by the board viewport", async () => {
  render(
    <div id="board-viewport" style={{ overflowY: "hidden" }}>
      <Harness />
    </div>,
  );
  await start();
  await move(1420, 220);
  expect(indicator()?.parentElement?.querySelector("article")?.dataset.taskCardId).toBe("y");
  scrollOffset = 150;
  await interact(() => {
    manager.collisionObserver.forceUpdate();
  });
  expect(indicator()?.className).toContain("-bottom-1");
  await move(1420, 350);
  expect(indicator()).toBeNull();
  await stop();
  expect(mutate).not.toHaveBeenCalled();
});

it.each([820, 1950])(
  "uses the actual release position for a fast pointer gesture at x=%s",
  async (x) => {
    render(<Harness />);
    const handle = screen.getByRole("button", { name: "Переместить задачу: a" });
    const pointer = { pointerType: "mouse", pointerId: 1, isPrimary: true, button: 0 };
    await interact(() => {
      fireEvent.pointerDown(handle, { ...pointer, clientX: 900, clientY: 120 });
    });
    expect(manager.dragOperation.status.dragging).toBe(true);
    await interact(() => {
      // PointerSensor batches movement until the next frame; release can arrive first.
      fireEvent.pointerMove(document, { ...pointer, clientX: x, clientY: 350 });
      fireEvent.pointerUp(document, { ...pointer, clientX: x, clientY: 350 });
    });
    if (x === 820)
      expect(mutate.mock.calls[0]?.[0].input).toEqual({
        revision: 1,
        status: "queue",
        beforeId: "c",
      });
    else expect(mutate).not.toHaveBeenCalled();
  },
);
