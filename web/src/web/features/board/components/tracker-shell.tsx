import { Columns3, Search, SeparatorHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { CreateTaskButton } from "./create-task-button";
import { boardText } from "@/features/board/i18n/board-copy";

type TrackerShellProps = {
  readonly children: ReactNode;
  readonly onCreateTask?: (() => void) | undefined;
  readonly onAddColumn?: (() => void) | undefined;
  readonly onAddDivider?: (() => void) | undefined;
  readonly onSearchChange?: ((value: string) => void) | undefined;
  readonly searchValue?: string | undefined;
};

export const TrackerShell = ({
  children,
  onCreateTask,
  onAddColumn,
  onAddDivider,
  onSearchChange,
  searchValue = "",
}: TrackerShellProps) => (
  <section className="flex h-full min-h-0 w-full flex-col">
    <div className="border-board-divider bg-board-surface flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      {onSearchChange && (
        <label className="group relative order-last block w-full min-w-0 md:order-none md:flex-1">
          <span className="sr-only">{boardText("Поиск задач")}</span>
          <Search
            aria-hidden="true"
            className="text-board-icon group-focus-within:text-board-accent absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
          />
          <input
            className="border-board-input-border bg-board-canvas text-board-input-text placeholder:text-board-placeholder focus:border-board-accent h-7 w-full rounded-sm border pr-2 pl-7 text-xs outline-none"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={boardText("Поиск задач...")}
            type="search"
            value={searchValue}
          />
        </label>
      )}
      {onCreateTask && <CreateTaskButton onClick={onCreateTask} />}
      {onAddColumn && (
        <button
          className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs font-medium transition"
          onClick={onAddColumn}
          type="button"
        >
          <Columns3 aria-hidden="true" className="size-3.5" />
          {boardText("Добавить колонку")}
        </button>
      )}
      {onAddDivider && (
        <button
          className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs font-medium transition"
          onClick={onAddDivider}
          type="button"
        >
          <SeparatorHorizontal aria-hidden="true" className="size-3.5" />
          {boardText("Добавить разделитель")}
        </button>
      )}
    </div>
    <div className="scroll-area min-h-0 flex-1 overflow-auto">{children}</div>
  </section>
);
