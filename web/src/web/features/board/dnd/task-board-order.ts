import {
  type BoardColumn,
  type Task,
  type TaskStatus,
  boardColumns,
} from "@/features/board/data/task-data";
import type { BoardDivider } from "@contracts/board-columns.js";

export type BoardDropTarget = {
  readonly status: TaskStatus;
  readonly beforeId: string | null;
};

export type BoardColumnItem =
  | { readonly kind: "task"; readonly id: string; readonly order: number; readonly task: Task }
  | {
      readonly kind: "divider";
      readonly id: string;
      readonly order: number;
      readonly divider: BoardDivider;
    };

export const getOrderedColumnTasks = (tasks: readonly Task[], status: TaskStatus) =>
  tasks
    .filter((task) => task.status === status)
    .sort(
      (first, second) =>
        first.order - second.order ||
        second.createdAt.localeCompare(first.createdAt) ||
        first.id.localeCompare(second.id),
    );

export const getOrderedColumnItems = (
  tasks: readonly Task[],
  dividers: readonly BoardDivider[],
  status: TaskStatus,
): BoardColumnItem[] =>
  [
    ...getOrderedColumnTasks(
      tasks.filter((task) => !task.archivedAt),
      status,
    ).map((task) => ({
      kind: "task" as const,
      id: task.id,
      order: task.order,
      task,
    })),
    ...dividers
      .filter((divider) => divider.columnId === status)
      .map((divider) => ({
        kind: "divider" as const,
        id: divider.id,
        order: divider.order,
        divider,
      })),
  ].sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));

export const moveBoardItem = (
  tasks: readonly Task[],
  dividers: readonly BoardDivider[],
  itemId: string,
  target: BoardDropTarget,
  columns: readonly BoardColumn[] = boardColumns,
): { readonly tasks: readonly Task[]; readonly dividers: readonly BoardDivider[] } => {
  const unchanged = { tasks, dividers };
  const sourceTask = tasks.find((task) => task.id === itemId);
  const sourceDivider = dividers.find((divider) => divider.id === itemId);
  const sourceStatus = sourceTask?.status ?? sourceDivider?.columnId;
  if (!sourceStatus || sourceTask?.archivedAt) return unchanged;
  const original = getOrderedColumnItems(tasks, dividers, sourceStatus);
  const source = original.find((item) => item.id === itemId);
  if (!source) return unchanged;
  const nextId = original[original.findIndex((item) => item.id === itemId) + 1]?.id ?? null;
  if (sourceStatus === target.status && nextId === target.beforeId) return unchanged;
  const destination = getOrderedColumnItems(tasks, dividers, target.status).filter(
    (item) => item.id !== itemId,
  );
  const index =
    target.beforeId === null
      ? destination.length
      : destination.findIndex((item) => item.id === target.beforeId);
  if (index < 0) return unchanged;
  const movedItem: BoardColumnItem =
    source.kind === "task"
      ? {
          ...source,
          order: 0,
          task: { ...source.task, status: target.status },
        }
      : {
          ...source,
          order: 0,
          divider: { ...source.divider, columnId: target.status },
        };
  destination.splice(index, 0, movedItem);
  const nextTasks = new Map(tasks.map((task) => [task.id, task]));
  const nextDividers = new Map(dividers.map((divider) => [divider.id, divider]));
  for (const { id: status } of columns) {
    const items =
      status === target.status
        ? destination
        : getOrderedColumnItems(tasks, dividers, status).filter((item) => item.id !== itemId);
    items.forEach((item, order) => {
      if (item.kind === "task") nextTasks.set(item.id, { ...item.task, status, order });
      else nextDividers.set(item.id, { ...item.divider, columnId: status, order });
    });
  }
  return {
    tasks: tasks.map((task) => nextTasks.get(task.id) ?? task),
    dividers: dividers.map((divider) => nextDividers.get(divider.id) ?? divider),
  };
};

export const moveBoardTask = (
  tasks: readonly Task[],
  dividers: readonly BoardDivider[],
  taskId: string,
  target: BoardDropTarget,
  columns: readonly BoardColumn[] = boardColumns,
) =>
  tasks.some((task) => task.id === taskId)
    ? moveBoardItem(tasks, dividers, taskId, target, columns)
    : { tasks, dividers };

/** Keep hidden cards in place and send a stable sibling ID, never a polling-dependent index. */
export const getFullColumnDropTarget = (
  visibleTasks: readonly Task[],
  allTasks: readonly Task[],
  itemId: string,
  target: BoardDropTarget,
  dividers: readonly BoardDivider[] = [],
): BoardDropTarget => {
  if (target.beforeId !== null) return target;
  const visible = getOrderedColumnItems(visibleTasks, dividers, target.status).filter(
    (item) => item.id !== itemId,
  );
  const last = visible.at(-1);
  if (!last) return target;
  const full = getOrderedColumnItems(allTasks, dividers, target.status).filter(
    (item) => item.id !== itemId,
  );
  const index = full.findIndex((item) => item.id === last.id);
  if (index < 0) return target;
  return { ...target, beforeId: full[index + 1]?.id ?? null };
};

export const getKeyboardDropTarget = (
  tasks: readonly Task[],
  dividers: readonly BoardDivider[],
  itemId: string,
  current: BoardDropTarget,
  direction: { readonly x: number; readonly y: number },
  columns: readonly BoardColumn[] = boardColumns,
): BoardDropTarget => {
  const column = getOrderedColumnItems(tasks, dividers, current.status).filter(
    (item) => item.id !== itemId,
  );
  let index =
    current.beforeId === null
      ? column.length
      : column.findIndex((task) => task.id === current.beforeId);
  const columnIndex = columns.findIndex((column) => column.id === current.status);
  const status =
    columns[Math.max(0, Math.min(columns.length - 1, columnIndex + Math.sign(direction.x)))]!
      .id;
  const destination = getOrderedColumnItems(tasks, dividers, status).filter(
    (item) => item.id !== itemId,
  );
  index = Math.max(0, Math.min(destination.length, index + Math.sign(direction.y)));
  return { status, beforeId: destination[index]?.id ?? null };
};
