import type { DragDropEventHandlers, DragDropManager } from "@dnd-kit/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { boardText } from "@/features/board/i18n/board-copy";
import { getPointerDropTarget, moveKeyboardOverlay } from "./task-board-drop";
import {
  type BoardDropTarget,
  getFullColumnDropTarget,
  getKeyboardDropTarget,
  getOrderedColumnItems,
  moveBoardTask,
} from "./task-board-order";
import { type BoardColumn, type Task, boardColumns } from "@/features/board/data/task-data";
import type { useUpdateTrackerCard } from "@/features/board/data/tracker-hooks";
import type { BoardDivider } from "@contracts/board-columns.js";

type DragSession = {
  readonly source: Task;
  readonly tasks: readonly Task[];
  readonly allTasks: readonly Task[];
  readonly dividers: readonly BoardDivider[];
  readonly keyboard: boolean;
  target: BoardDropTarget | null;
  saving: boolean;
};

export const useBoardDrag = (
  tasks: readonly Task[],
  allTasks: readonly Task[] | undefined,
  dividers: readonly BoardDivider[],
  updateCard: Pick<ReturnType<typeof useUpdateTrackerCard>, "mutate" | "isPending">,
  columns: readonly BoardColumn[] = boardColumns,
) => {
  const session = useRef<DragSession | null>(null);
  const [displayedTasks, setDisplayedTasks] = useState<readonly Task[] | null>(null);
  const [displayedDividers, setDisplayedDividers] = useState<readonly BoardDivider[] | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<BoardDropTarget | null>(null);
  const clear = () => {
    session.current = null;
    setDisplayedTasks(null);
    setDisplayedDividers(null);
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
      updateTarget(
        getPointerDropTarget(
          manager,
          drag.tasks,
          drag.dividers,
          drag.source.id,
          undefined,
          columns,
        ),
      );
  };
  const handleBeforeDragStart: DragDropEventHandlers["onBeforeDragStart"] = (event) => {
    if (!allTasks || updateCard.isPending || session.current) event.preventDefault();
  };
  const handleDragStart: DragDropEventHandlers["onDragStart"] = (event, manager) => {
    const source = tasks.find((task) => task.id === event.operation.source?.id);
    if (!source || source.status === "archived" || !allTasks) return;
    const column = getOrderedColumnItems(tasks, dividers, source.status);
    const target = {
      status: source.status,
      beforeId: column[column.findIndex((item) => item.id === source.id) + 1]?.id ?? null,
    };
    session.current = {
      source,
      tasks,
      allTasks,
      dividers,
      target,
      keyboard: event.operation.activatorEvent?.type === "keydown",
      saving: false,
    };
    // Keep hit areas stationary until release; polling cannot shift them under the pointer.
    setDisplayedTasks(tasks);
    setDisplayedDividers(dividers);
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
    const target = getKeyboardDropTarget(
      drag.tasks,
      drag.dividers,
      drag.source.id,
      drag.target,
      event.by,
      columns,
    );
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
      : getPointerDropTarget(
          manager,
          drag.tasks,
          drag.dividers,
          drag.source.id,
          point,
          columns,
        );
    if (event.canceled || !target) {
      clear();
      return;
    }
    const fullTarget = getFullColumnDropTarget(
      drag.tasks,
      drag.allTasks,
      drag.source.id,
      target,
      drag.dividers,
    );
    const next = moveBoardTask(
      drag.allTasks,
      drag.dividers,
      drag.source.id,
      fullTarget,
      columns,
    );
    if (next.tasks === drag.allTasks && next.dividers === drag.dividers) {
      clear();
      return;
    }
    drag.saving = true;
    setDropTarget(null);
    const visibleIds = new Set(drag.tasks.map((task) => task.id));
    setDisplayedTasks(next.tasks.filter((task) => visibleIds.has(task.id)));
    setDisplayedDividers(next.dividers);
    updateCard.mutate(
      {
        id: drag.source.id,
        input: {
          revision: drag.source.revision,
          ...fullTarget,
        },
      },
      {
        onError: () => {
          toast.error(boardText("Не удалось переместить задачу"));
          clear();
        },
        onSuccess: () => {
          const label =
            columns.find((column) => column.id === target.status)?.label ?? target.status;
          toast.success(boardText("Задача перемещена в «{0}»", boardText(label)));
          clear();
        },
      },
    );
  };
  return {
    displayedTasks: displayedTasks ?? tasks,
    displayedDividers: displayedDividers ?? dividers,
    dropTarget,
    handleBeforeDragStart,
    handleDragStart,
    handleCollision,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  };
};
