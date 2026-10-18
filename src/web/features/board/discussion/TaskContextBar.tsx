import { LockKeyhole, ExternalLink } from "lucide-react";
import type { Task } from "@contracts/board.js";
import { usePreferences } from "@/shared/i18n/preferences";
import { taskUrl } from "./task-context";
import { AppLink } from "@/app/AppLink";

export const TaskContextBar = ({ task }: { task: Task }) => {
  const { copy } = usePreferences();
  const url = taskUrl(task.id);
  return (
    <section
      aria-label={copy.taskContext}
      className="border-line bg-canvas/60 mb-2 flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs"
    >
      <LockKeyhole aria-hidden="true" size={14} className="text-muted mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ink truncate font-medium" title={task.title}>
            {task.title}
          </span>
          <span className="text-muted font-mono break-all">ID: {task.id}</span>
        </div>
        <AppLink
          href={url}
          title={url}
          className="text-accent mt-1 flex min-w-0 items-center gap-1"
        >
          <span className="truncate">{url}</span>
          <ExternalLink aria-hidden="true" size={12} className="shrink-0" />
        </AppLink>
        <p className="text-muted mt-1">{copy.taskContextPinned}</p>
      </div>
    </section>
  );
};
