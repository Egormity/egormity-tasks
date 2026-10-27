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

export const moveBoardTask = (
  tasks: readonly Task[],
  dividers: readonly BoardDivider[],
  taskId: string,
  target: BoardDropTarget,
  columns: readonly BoardColumn[] = boardColumns,
): { readonly tasks: readonly Task[]; readonly dividers: readonly BoardDivider[] } => {
  const source = tasks.find((task) => task.id === taskId);
  const unchanged = { tasks, dividers };
  if (!source || source.status === "archived") return unchanged;
  const original = getOrderedColumnItems(tasks, dividers, source.status);
  const nextId = original[original.findIndex((item) => item.id === taskId) + 1]?.id ?? null;
  if (source.status === target.status && nextId === target.beforeId) return unchanged;
  const destination = getOrderedColumnItems(tasks, dividers, target.status).filter(
    (item) => item.id !== taskId,
  );
  const index =
    target.beforeId === null
      ? destination.length
      : destination.findIndex((item) => item.id === target.beforeId);
  if (index < 0) return unchanged;
  destination.splice(index, 0, {
    kind: "task",
    id: source.id,
    order: 0,
    task: { ...source, status: target.status },
  });
  const nextTasks = new Map(tasks.map((task) => [task.id, task]));
  const nextDividers = new Map(dividers.map((divider) => [divider.id, divider]));
  for (const { id: status } of columns) {
    const items =
      status === target.status
        ? destination
        : getOrderedColumnItems(tasks, dividers, status).filter((item) => item.id !== taskId);
    items.forEach((item, order) => {
      if (item.kind === "task") nextTasks.set(item.id, { ...item.task, status, order });
      else nextDividers.set(item.id, { ...item.divider, order });
    });
  }
  return {
    tasks: tasks.map((task) => nextTasks.get(task.id) ?? task),
    dividers: dividers.map((divider) => nextDividers.get(divider.id) ?? divider),
  };
};

/** Keep hidden cards in place and send a stable sibling ID, never a polling-dependent index. */
export const getFullColumnDropTarget = (
  visibleTasks: readonly Task[],
  allTasks: readonly Task[],
  taskId: string,
  target: BoardDropTarget,
  dividers: readonly BoardDivider[] = [],
): BoardDropTarget => {
  if (target.beforeId !== null) return target;
  const visible = getOrderedColumnItems(visibleTasks, dividers, target.status).filter(
    (item) => item.id !== taskId,
  );
  const last = visible.at(-1);
  if (!last) return target;
  const full = getOrderedColumnItems(allTasks, dividers, target.status).filter(
    (item) => item.id !== taskId,
  );
  const index = full.findIndex((item) => item.id === last.id);
  if (index < 0) return target;
  return { ...target, beforeId: full[index + 1]?.id ?? null };
};

export const getKeyboardDropTarget = (
  tasks: readonly Task[],
  dividers: readonly BoardDivider[],
  taskId: string,
  current: BoardDropTarget,
  direction: { readonly x: number; readonly y: number },
  columns: readonly BoardColumn[] = boardColumns,
): BoardDropTarget => {
  const column = getOrderedColumnItems(tasks, dividers, current.status).filter(
    (item) => item.id !== taskId,
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
    (item) => item.id !== taskId,
  );
  index = Math.max(0, Math.min(destination.length, index + Math.sign(direction.y)));
  return { status, beforeId: destination[index]?.id ?? null };
};
