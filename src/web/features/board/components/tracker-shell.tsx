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
  <section className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col px-4 py-4 sm:px-7 sm:py-8">
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:mb-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-board-heading truncate text-[20px] font-bold tracking-[-0.035em] sm:text-[22px]">
          {title}
        </h1>
        {headerSummary && <div className="leading-4">{headerSummary}</div>}
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap">
        <button
          type="button"
          onClick={onToggleArchive}
          aria-pressed={archived}
          className="text-board-icon hover:bg-board-selected flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm"
        >
          <Archive className="size-4" />
          {boardText(archived ? "Активные задачи" : "Архив")}
        </button>
        {onSearchChange && (
          <label className="group relative order-last block w-full lg:order-none lg:w-auto">
            <span className="sr-only">{boardText("Поиск задач")}</span>
            <Search
              aria-hidden="true"
              className="text-board-icon group-focus-within:text-board-accent-hover absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 transition-colors"
            />
            <input
              className="border-board-input-border bg-board-surface text-board-input-text placeholder:text-board-placeholder focus:border-board-accent focus:ring-board-accent/15 h-11 w-full rounded-xl border pr-3 pl-10 text-base transition outline-none focus:ring-2 lg:w-[180px] lg:text-sm xl:w-[232px]"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={boardText("Поиск задач...")}
              type="search"
              value={searchValue}
            />
          </label>
        )}
        {onCreateTask && (
          <div className="ml-auto shrink-0 lg:ml-0">
            <CreateTaskButton onClick={onCreateTask} />
          </div>
        )}
      </div>
    </div>
    <div className="min-h-0 flex-1">{children}</div>
  </section>
);
