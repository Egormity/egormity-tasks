import { useDroppable } from "@dnd-kit/react";
import { Download } from "lucide-react";

import { DraggableTaskCard } from "./task-card";
import type { BoardColumn as BoardColumnType, Task } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";

type BoardColumnProps = {
  readonly column: BoardColumnType;
  readonly dragDisabled: boolean;
  readonly exportDisabled: boolean;
  readonly exportTaskCount: number;
  readonly isExporting: boolean;
  readonly onExportAll: () => void;
  readonly onOpen: (task: Task) => void;
  readonly tasks: readonly Task[];
  readonly insertionBeforeId?: string | null | undefined;
};

export const BoardColumn = ({
  column,
  dragDisabled,
  exportDisabled,
  exportTaskCount,
  isExporting,
  onExportAll,
  onOpen,
  tasks,
  insertionBeforeId,
}: BoardColumnProps) => {
  const { ref } = useDroppable({
    data: { columnId: column.id },
    accept: "task",
    id: column.id,
    type: "column",
  });

  return (
    <section
      ref={ref}
      data-board-column-id={column.id}
      className={`bg-board-column-surface flex min-w-[250px] flex-1 flex-col overflow-hidden rounded-xl border transition ${
        insertionBeforeId !== undefined
          ? "border-board-drop-border bg-board-drop-surface"
          : "border-board-column-border"
      }`}
    >
      <div
        className="h-1 shrink-0 rounded-t-xl"
        data-column-accent={column.id}
        style={{ backgroundColor: column.accent }}
      />
      <header className="flex shrink-0 flex-col items-stretch gap-3 px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-board-column-title text-[15px] font-semibold">
            {boardText(column.label)}
          </h2>
          <span className="bg-board-count-surface text-board-count rounded-md px-2 py-0.5 text-[11px] font-semibold">
            {tasks.length}
          </span>
        </div>
        <button
          aria-label={boardText("Экспортировать все задачи колонки «{0}»", column.label)}
          className="border-board-button-border bg-board-surface text-board-button-text hover:border-board-button-border-hover hover:bg-board-button-hover inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
          disabled={exportDisabled || exportTaskCount === 0}
          onClick={onExportAll}
          type="button"
        >
          <Download aria-hidden="true" className="size-3.5" />
          {isExporting ? boardText("Подготовка архива…") : boardText("Экспортировать все")}
        </button>
      </header>

      <div className="relative flex flex-1 flex-col gap-3 px-3 pb-3">
        {tasks.length > 0 ? (
          tasks.map((task, index) => (
            <div className="relative" key={task.id}>
              {insertionBeforeId === task.id && <DropIndicator />}
              <DraggableTaskCard dragDisabled={dragDisabled} onOpen={onOpen} task={task} />
              {insertionBeforeId === null && index === tasks.length - 1 && (
                <DropIndicator after />
              )}
            </div>
          ))
        ) : (
          <div className="border-board-empty-border text-board-subtle relative grid min-h-24 flex-1 place-items-center rounded-xl border border-dashed px-4 text-center text-xs">
            {insertionBeforeId === null && <DropIndicator />}
            {boardText("Нет подходящих задач")}
          </div>
        )}
      </div>
    </section>
  );
};

const DropIndicator = ({ after = false }: { readonly after?: boolean }) => (
  <span
    aria-hidden="true"
    data-board-drop-indicator=""
    className={`bg-board-drag pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full ${after ? "-bottom-1.5" : "-top-1.5"}`}
  />
);
