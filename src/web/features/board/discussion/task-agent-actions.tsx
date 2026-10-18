import { useState } from "react";
import { Bot, Plus, MessageSquare, CheckCircle2 } from "lucide-react";
import { taskDiscussionHref, writeDraftLocation } from "@/app/navigation";
import { AppLink } from "@/app/AppLink";
import { TaskChatPicker } from "./TaskChatPicker";
import { boardText } from "@/features/board/i18n/board-copy";

export const AgentVerdict = ({ verdict }: { verdict?: string | null | undefined }) => (
  <section
    className={`rounded-xl border p-4 ${verdict?.trim() ? "border-emerald-500/25 bg-emerald-500/10" : "border-line bg-canvas/50"}`}
  >
    <h3 className="text-ink flex items-center gap-2 text-sm font-medium">
      {verdict?.trim() ? <CheckCircle2 size={16} /> : <Bot size={16} className="text-muted" />}
      {boardText("Вердикт агента")}
    </h3>
    <p className="text-muted mt-3 text-sm whitespace-pre-wrap wrap-anywhere">
      {verdict?.trim() || boardText("Пока не оценена")}
    </p>
    {!verdict?.trim() && (
      <p className="text-muted mt-1 text-xs leading-5">
        {boardText("Обсудите задачу с агентом, чтобы получить вердикт.")}
      </p>
    )}
  </section>
);

export const TaskAgentActions = ({
  taskId,
  showOpen = true,
  showManage = true,
}: {
  taskId: string;
  showOpen?: boolean;
  showManage?: boolean;
}) => {
  const [choosing, setChoosing] = useState(false);
  return (
    <div className="space-y-3">
      {showOpen && (
        <AppLink
          href={taskDiscussionHref(taskId)}
          className="bg-accent text-on-accent flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm"
        >
          <Bot size={16} />
          {boardText("Обсудить с агентом")}
        </AppLink>
      )}
      {showManage && (
        <>
          <button
            type="button"
            onClick={() => writeDraftLocation(taskId)}
            className="border-line hover:bg-accent/10 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          >
            <Plus size={16} />
            {boardText("Новый чат")}
          </button>
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="border-line hover:bg-accent/10 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <MessageSquare size={16} />
            {boardText("Выбрать существующий чат")}
          </button>
          {choosing && <TaskChatPicker taskId={taskId} onClose={() => setChoosing(false)} />}
        </>
      )}
    </div>
  );
};
