import { Archive, Search } from "lucide-react";
import type { ReactNode } from "react";

import { CreateTaskButton } from "./create-task-button";
import { boardText } from "@/features/board/i18n/board-copy";

type TrackerShellProps = {
  readonly children: ReactNode;
  readonly headerSummary?: ReactNode | undefined;
  readonly onCreateTask?: (() => void) | undefined;
  readonly onSearchChange?: ((value: string) => void) | undefined;
  readonly searchValue?: string | undefined;
  readonly title: string;
  readonly archived: boolean;
  readonly onToggleArchive: () => void;
};

export const TrackerShell = ({
  children,
  headerSummary,
  onCreateTask,
  onSearchChange,
  searchValue = "",
  title,
  archived,
  onToggleArchive,
}: TrackerShellProps) => (
  <section className="flex h-full min-h-0 w-full flex-col">
    <div className="border-board-divider bg-board-surface flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="mr-auto flex min-w-0 items-center gap-2 sm:mr-2">
        <h1 className="text-board-heading truncate text-[13px] font-semibold">{title}</h1>
        {headerSummary && <div className="hidden sm:block">{headerSummary}</div>}
      </div>
      {onSearchChange && (
        <label className="group relative order-last block w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
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
      <button
        type="button"
        onClick={onToggleArchive}
        aria-pressed={archived}
        className="border-board-button-border text-board-button-text hover:bg-board-selected flex h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[11px]"
      >
        <Archive aria-hidden="true" className="size-3.5" />
        {boardText(archived ? "Активные задачи" : "Архив")}
      </button>
      {onCreateTask && <CreateTaskButton onClick={onCreateTask} />}
    </div>
    <div className="scroll-area min-h-0 flex-1 overflow-auto">{children}</div>
  </section>
);
