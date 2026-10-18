import { type Task, type TaskStatus, boardColumns } from "@/features/board/data/task-data";

export type BoardDropTarget = {
  readonly status: TaskStatus;
  readonly beforeId: string | null;
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

export const moveBoardTask = (
  tasks: readonly Task[],
  taskId: string,
  target: BoardDropTarget,
): readonly Task[] => {
  const source = tasks.find((task) => task.id === taskId);
  if (!source || source.status === "archived") return tasks;
  const original = getOrderedColumnTasks(tasks, source.status);
  const nextId = original[original.findIndex((task) => task.id === taskId) + 1]?.id ?? null;
  if (source.status === target.status && nextId === target.beforeId) return tasks;
  const destination = getOrderedColumnTasks(tasks, target.status).filter(
    (task) => task.id !== taskId,
  );
  const index =
    target.beforeId === null
      ? destination.length
      : destination.findIndex((task) => task.id === target.beforeId);
  if (index < 0) return tasks;
  destination.splice(index, 0, { ...source, status: target.status });
  return boardColumns.flatMap(({ id }) =>
    (id === target.status
      ? destination
      : getOrderedColumnTasks(tasks, id).filter((task) => task.id !== taskId)
    ).map((task, order) => ({ ...task, order })),
  );
};

/** Keep hidden cards in place and send a stable sibling ID, never a polling-dependent index. */
export const getFullColumnDropTarget = (
  visibleTasks: readonly Task[],
  allTasks: readonly Task[],
  taskId: string,
  target: BoardDropTarget,
): BoardDropTarget => {
  if (target.beforeId !== null) return target;
  const visible = getOrderedColumnTasks(visibleTasks, target.status).filter(
    (task) => task.id !== taskId,
  );
  const last = visible.at(-1);
  if (!last) return target;
  const full = getOrderedColumnTasks(allTasks, target.status).filter(
    (task) => task.id !== taskId,
  );
  const index = full.findIndex((task) => task.id === last.id);
  if (index < 0) return target;
  return { ...target, beforeId: full[index + 1]?.id ?? null };
};

export const getKeyboardDropTarget = (
  tasks: readonly Task[],
  taskId: string,
  current: BoardDropTarget,
  direction: { readonly x: number; readonly y: number },
): BoardDropTarget => {
  const column = getOrderedColumnTasks(tasks, current.status).filter(
    (task) => task.id !== taskId,
  );
  let index =
    current.beforeId === null
      ? column.length
      : column.findIndex((task) => task.id === current.beforeId);
  const columnIndex = boardColumns.findIndex((column) => column.id === current.status);
  const status =
    boardColumns[
      Math.max(0, Math.min(boardColumns.length - 1, columnIndex + Math.sign(direction.x)))
    ]!.id;
  const destination = getOrderedColumnTasks(tasks, status).filter((task) => task.id !== taskId);
  index = Math.max(0, Math.min(destination.length, index + Math.sign(direction.y)));
  return { status, beforeId: destination[index]?.id ?? null };
};
