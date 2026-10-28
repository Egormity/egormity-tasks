import { useDroppable } from "@dnd-kit/react";
import { Settings2 } from "lucide-react";

import { DraggableTaskCard } from "./task-card";
import { DraggableBoardDivider } from "./board-divider-row";
import type { BoardColumn as BoardColumnType, Task } from "@/features/board/data/task-data";
import type { BoardDivider } from "@contracts/board-columns.js";

import { boardText } from "@/features/board/i18n/board-copy";
import { getOrderedColumnItems } from "@/features/board/dnd/task-board-order";

type BoardColumnProps = {
  readonly column: BoardColumnType;
  readonly dragDisabled: boolean;
  readonly onConfigure: () => void;
  readonly onOpen: (task: Task) => void;
  readonly tasks: readonly Task[];
  readonly dividers: readonly BoardDivider[];
  readonly insertionBeforeId?: string | null | undefined;
};

export const BoardColumn = ({
  column,
  dragDisabled,
  onConfigure,
  onOpen,
  tasks,
  dividers,
  insertionBeforeId,
}: BoardColumnProps) => {
  const items = getOrderedColumnItems(tasks, dividers, column.id);
  const { ref } = useDroppable({
    data: { columnId: column.id },
    accept: ["task", "divider"],
    id: column.id,
    type: "column",
  });

  return (
    <section
      ref={ref}
      data-board-column-id={column.id}
      className={`bg-board-column-surface flex min-w-[220px] flex-1 flex-col overflow-hidden border-r transition-colors ${
        insertionBeforeId !== undefined
          ? "border-board-drop-border bg-board-drop-surface"
          : "border-board-column-border"
      }`}
    >
      <div
        className="h-0.5 shrink-0"
        data-column-accent={column.id}
        style={{ backgroundColor: column.accent }}
      />
      <header className="border-board-column-border flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h2
            title={boardText(column.label)}
            className="text-board-column-title truncate text-[14px] font-semibold"
          >
            {boardText(column.label)}
          </h2>
          <span className="bg-board-count-surface text-board-count shrink-0 rounded-sm px-1.5 py-0.5 text-[12px] tabular-nums">
            {tasks.length}
          </span>
        </div>
        <button
          aria-label={boardText("Настроить колонку {0}", boardText(column.label))}
          title={boardText("Настроить колонку")}
          className="text-board-icon hover:bg-board-selected grid size-6 shrink-0 place-items-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          onClick={onConfigure}
          type="button"
        >
          <Settings2 aria-hidden="true" className="size-3.5" />
        </button>
      </header>

      <div className="relative flex flex-1 flex-col gap-1.5 p-1.5">
        {items.length === 0 && (
          <div className="text-board-subtle relative grid min-h-16 place-items-center px-2 py-4 text-center text-[14px]">
            {boardText("Нет подходящих задач")}
          </div>
        )}
        {items.map((item) => (
          <div className="relative" data-board-order-item-id={item.id} key={item.id}>
            {insertionBeforeId === item.id && <DropSlot />}
            {item.kind === "task" ? (
              <DraggableTaskCard dragDisabled={dragDisabled} onOpen={onOpen} task={item.task} />
            ) : (
              <DraggableBoardDivider dragDisabled={dragDisabled} divider={item.divider} />
            )}
          </div>
        ))}
        {insertionBeforeId === null && (
          <div className="relative">
            <DropSlot />
          </div>
        )}
      </div>
    </section>
  );
};

const DropSlot = () => (
  <div
    aria-hidden="true"
    data-board-drop-indicator=""
    className="border-board-drag bg-board-drop-surface pointer-events-none mb-1 grid h-12 place-items-center rounded border border-dashed transition-[height,margin]"
  >
    <span className="bg-board-drag h-0.5 w-4/5 rounded-full" />
  </div>
);
