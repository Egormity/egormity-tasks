import { Bot, Check, MessageCircle, Minus } from "lucide-react";
import type { Task } from "@/features/board/data/task-data";
import { boardText } from "@/features/board/i18n/board-copy";
import { taskDiscussionHref } from "@/app/navigation";
import { AppLink } from "@/app/AppLink";

export const TaskAgentRail = ({ task, overlay }: { task: Task; overlay: boolean }) => {
  const assessed = !!task.agentVerdict?.trim();
  const discussing = !!task.agentChatId;
  const status = boardText(
    assessed ? "Вердикт агента готов" : discussing ? "Обсуждение с агентом" : "Пока не оценена",
  );
  const className = `absolute inset-y-0 left-0 flex w-11 flex-col items-center justify-center gap-3 rounded-l-xl border-r transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
    assessed
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 [[data-theme=dark]_&]:text-emerald-400"
      : discussing
        ? "border-blue-500/25 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 [[data-theme=dark]_&]:text-blue-400"
        : "border-board-card-border bg-board-muted/5 text-board-muted hover:bg-board-muted/15"
  }`;
  const contents = (
    <>
      <Bot aria-hidden="true" size={18} />
      {assessed ? (
        <Check aria-hidden="true" size={16} />
      ) : discussing ? (
        <MessageCircle aria-hidden="true" size={16} />
      ) : (
        <Minus aria-hidden="true" size={16} />
      )}
    </>
  );
  return overlay ? (
    <span className={className}>{contents}</span>
  ) : (
    <AppLink
      href={taskDiscussionHref(task.id)}
      aria-label={boardText("Обсудить задачу с агентом: {0}", task.title)}
      title={`${boardText("Обсудить с агентом")} · ${status}`}
      className={className}
    >
      {contents}
      <span className="sr-only">{status}</span>
    </AppLink>
  );
};
