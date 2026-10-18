import { useState } from "react";
import { ChevronDown, FileText, Maximize2 } from "lucide-react";
import { usePreferences } from "@/shared/i18n/preferences";
import { boardColumns, type Task } from "@/features/board/data/task-data";
import { boardText } from "@/features/board/i18n/board-copy";
import { taskTagToneStyles } from "@/features/board/tags/task-tag-styles";
import { TaskAttachmentsCarousel } from "@/features/board/attachments/task-attachments-carousel";
import { AgentVerdict, TaskAgentActions } from "./task-agent-actions";

export const TaskDetails = ({ task, onOpen }: { task: Task; onOpen: () => void }) => {
  const { copy } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const column = boardColumns.find((value) => value.id === task.status);
  return (
    <aside
      aria-label={copy.taskDetails}
      className="scroll-area border-line bg-panel max-h-[40dvh] min-w-0 shrink-0 overflow-y-auto border-b lg:max-h-none lg:w-80 lg:border-r lg:border-b-0 xl:w-96"
    >
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="border-line bg-canvas inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: column?.accent }}
            />
            {boardText(column?.label ?? "Архив")}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={copy.taskDetails}
            aria-expanded={expanded}
            className="text-muted ml-auto p-1 lg:hidden"
          >
            <ChevronDown size={18} className={expanded ? "rotate-180" : ""} />
          </button>
        </div>
        <h1 className="text-lg leading-7 font-semibold wrap-anywhere">{task.title}</h1>
        <p className="text-muted mt-2 font-mono text-[11px] break-all">ID: {task.id}</p>
        <button
          type="button"
          onClick={onOpen}
          className="border-line text-accent hover:bg-accent/10 mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Maximize2 size={16} aria-hidden="true" />
          {copy.openTask}
        </button>
        <div className={`${expanded ? "block" : "hidden"} mt-5 space-y-5 lg:block`}>
          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((tag) => (
                <span
                  key={tag.id}
                  className={`rounded-md px-2 py-1 text-xs wrap-anywhere ${taskTagToneStyles[tag.tone]}`}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          {task.description && (
            <section className="border-line border-t pt-4">
              <h2 className="text-muted mb-3 flex items-center gap-2 text-xs font-medium">
                <FileText size={14} />
                {copy.description}
              </h2>
              <p className="text-sm leading-6 whitespace-pre-wrap wrap-anywhere">
                {task.description}
              </p>
            </section>
          )}
          {task.attachments.length > 0 && (
            <section>
              <h2 className="text-muted mb-3 text-xs font-medium">
                {copy.attachments} · {task.attachments.length}
              </h2>
              <TaskAttachmentsCarousel attachments={task.attachments} cardId={task.id} />
            </section>
          )}
          <AgentVerdict verdict={task.agentVerdict} />
          <TaskAgentActions taskId={task.id} showOpen={false} />
        </div>
      </div>
    </aside>
  );
};
