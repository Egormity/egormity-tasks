import type { DragDropManager } from "@dnd-kit/react";

import { type BoardDropTarget, getOrderedColumnTasks } from "./task-board-order";
import { type Task, boardColumns } from "@/features/board/data/task-data";

type Point = { readonly x: number; readonly y: number };

const contains = (rect: DOMRect, point: Point) =>
  point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;

const containsVisiblePoint = (element: Element, point: Point) => {
  if (!contains(element.getBoundingClientRect(), point)) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (
      /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
      (point.x < rect.left || point.x >= rect.right)
    )
      return false;
    if (
      /(auto|scroll|hidden|clip)/.test(style.overflowY) &&
      (point.y < rect.top || point.y >= rect.bottom)
    )
      return false;
  }
  return true;
};

export const getPointerDropTarget = (
  manager: DragDropManager,
  tasks: readonly Task[],
  taskId: string,
  point: Point = manager.dragOperation.position.current,
): BoardDropTarget | null => {
  for (const { id: status } of boardColumns) {
    const element = manager.registry.droppables.get(status)?.element;
    if (!element || !containsVisiblePoint(element, point)) continue;
    const elements = new Map(
      Array.from(element.querySelectorAll<HTMLElement>("[data-task-card-id]")).map((card) => [
        card.dataset.taskCardId,
        card,
      ]),
    );
    const before = getOrderedColumnTasks(tasks, status).find((task) => {
      if (task.id === taskId) return false;
      const rect = elements.get(task.id)?.getBoundingClientRect();
      return rect && point.y < rect.top + rect.height / 2;
    });
    return { status, beforeId: before?.id ?? null };
  }
  return null;
};

export const moveKeyboardOverlay = (manager: DragDropManager, target: BoardDropTarget) => {
  const column = manager.registry.droppables.get(target.status)?.element;
  if (!column) return;
  const cards = Array.from(column.querySelectorAll<HTMLElement>("[data-task-card-id]"));
  const anchor =
    cards.find((card) => card.dataset.taskCardId === target.beforeId) ?? cards.at(-1);
  (anchor ?? column).scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = (anchor ?? column).getBoundingClientRect();
  manager.actions.move({
    to: {
      x: rect.left + rect.width / 2,
      y: target.beforeId === null && anchor ? rect.bottom : rect.top,
    },
    propagate: false,
  });
};
