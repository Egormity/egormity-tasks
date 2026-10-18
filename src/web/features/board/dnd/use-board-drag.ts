import type { DragDropEventHandlers, DragDropManager } from "@dnd-kit/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { boardText } from "@/features/board/i18n/board-copy";
import { getPointerDropTarget, moveKeyboardOverlay } from "./task-board-drop";
import {
  type BoardDropTarget,
  getFullColumnDropTarget,
  getKeyboardDropTarget,
  getOrderedColumnTasks,
  moveBoardTask,
} from "./task-board-order";
import { type Task, boardColumns } from "@/features/board/data/task-data";
import type { useUpdateTrackerCard } from "@/features/board/data/tracker-hooks";

type DragSession = {
  readonly source: Task;
  readonly tasks: readonly Task[];
  readonly allTasks: readonly Task[];
  readonly keyboard: boolean;
  target: BoardDropTarget | null;
  saving: boolean;
};

export const useBoardDrag = (
  tasks: readonly Task[],
  allTasks: readonly Task[] | undefined,
  updateCard: Pick<ReturnType<typeof useUpdateTrackerCard>, "mutate" | "isPending">,
) => {
  const session = useRef<DragSession | null>(null);
  const [displayedTasks, setDisplayedTasks] = useState<readonly Task[] | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardDropTarget | null>(null);
  const clear = () => {
    session.current = null;
    setDisplayedTasks(null);
    setDropTarget(null);
  };
  const updateTarget = (target: BoardDropTarget | null) => {
    const drag = session.current;
    if (
      !drag ||
      drag.saving ||
      (drag.target?.status === target?.status && drag.target?.beforeId === target?.beforeId)
    )
      return;
    drag.target = target;
    setDropTarget(target);
  };
  const updatePointer = (manager: DragDropManager) => {
    const drag = session.current;
    if (drag && !drag.keyboard && !drag.saving)
      updateTarget(getPointerDropTarget(manager, drag.tasks, drag.source.id));
  };
  const handleBeforeDragStart: DragDropEventHandlers["onBeforeDragStart"] = (event) => {
    if (!allTasks || updateCard.isPending || session.current) event.preventDefault();
  };
  const handleDragStart: DragDropEventHandlers["onDragStart"] = (event, manager) => {
    const source = tasks.find((task) => task.id === event.operation.source?.id);
    if (!source || source.status === "archived" || !allTasks) return;
    const column = getOrderedColumnTasks(tasks, source.status);
    const target = {
      status: source.status,
      beforeId: column[column.findIndex((task) => task.id === source.id) + 1]?.id ?? null,
    };
    session.current = {
      source,
      tasks,
      allTasks,
      target,
      keyboard: event.operation.activatorEvent?.type === "keydown",
      saving: false,
    };
    // Keep hit areas stationary until release; polling cannot shift them under the pointer.
    setDisplayedTasks(tasks);
    setDropTarget(target);
    updatePointer(manager);
  };
  const handleCollision: DragDropEventHandlers["onCollision"] = (_event, manager) =>
    updatePointer(manager);
  const handleDragOver: DragDropEventHandlers["onDragOver"] = (event, manager) => {
    event.preventDefault();
    updatePointer(manager);
  };
  const handleDragMove: DragDropEventHandlers["onDragMove"] = (event, manager) => {
    const drag = session.current;
    if (!drag?.keyboard || !event.by || !drag.target) return;
    event.preventDefault();
    const target = getKeyboardDropTarget(drag.tasks, drag.source.id, drag.target, event.by);
    updateTarget(target);
    moveKeyboardOverlay(manager, target);
  };
  const handleDragEnd: DragDropEventHandlers["onDragEnd"] = (event, manager) => {
    const drag = session.current;
    if (!drag || drag.saving) return;
    // Pointer moves are frame-batched by the sensor; pointerup may precede the last frame.
    const release = event.nativeEvent;
    const point =
      release &&
      "clientX" in release &&
      "clientY" in release &&
      typeof release.clientX === "number" &&
      typeof release.clientY === "number"
        ? { x: release.clientX, y: release.clientY }
        : undefined;
    const target = drag.keyboard
      ? drag.target
      : getPointerDropTarget(manager, drag.tasks, drag.source.id, point);
    if (event.canceled || !target) {
      clear();
      return;
    }
    const next = moveBoardTask(drag.tasks, drag.source.id, target);
    if (next === drag.tasks) {
      clear();
      return;
    }
    drag.saving = true;
    setDropTarget(null);
    setDisplayedTasks(next);
    updateCard.mutate(
      {
        id: drag.source.id,
        input: {
          revision: drag.source.revision,
          ...getFullColumnDropTarget(drag.tasks, drag.allTasks, drag.source.id, target),
        },
      },
      {
        onError: () => {
          toast.error(boardText("Не удалось переместить задачу"));
          clear();
        },
        onSuccess: () => {
          const label = boardColumns.find((column) => column.id === target.status)!.label;
          toast.success(boardText("Задача перемещена в «{0}»", boardText(label)));
          clear();
        },
      },
    );
  };
  return {
    displayedTasks: displayedTasks ?? tasks,
    dropTarget,
    handleBeforeDragStart,
    handleDragStart,
    handleCollision,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  };
};
