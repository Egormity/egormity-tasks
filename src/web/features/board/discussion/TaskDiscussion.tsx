import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AgentPage } from "@/features/agent/AgentPage";
import { usePreferences } from "@/shared/i18n/preferences";
import { readWorkspaceLocation, writeTaskLocation } from "@/app/navigation";
import { AppLink } from "@/app/AppLink";
import { trackerBoardQuery } from "@/features/board/data/tracker-query";
import { toTrackerTask } from "@/features/board/data/tracker-api";
import { TaskDetails } from "./TaskDetails";
import { useTaskEditor } from "@/features/board/editor/use-task-editor";

export const TaskDiscussion = ({
  taskId,
  chatId,
  onSessionExpired,
}: {
  taskId: string;
  chatId: string | null;
  onSessionExpired: () => void;
}) => {
  const { copy } = usePreferences();
  const editor = useTaskEditor();
  const board = useQuery(trackerBoardQuery);
  const rawTask = board.data?.cards.find((card) => card.id === taskId);
  const task = rawTask && toTrackerTask(rawTask, board.data?.tags ?? []);
  const linkedChat = board.data?.taskChats?.find((link) => link.taskId === taskId);
  const draft = readWorkspaceLocation().draft;
  useEffect(() => {
    if (rawTask && !chatId && !draft && linkedChat)
      writeTaskLocation(taskId, linkedChat.chatId, true);
  }, [taskId, chatId, draft, rawTask, linkedChat]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="border-line flex shrink-0 items-center border-b px-4 py-3">
        <AppLink
          href="/tasks"
          className="text-muted hover:text-ink flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} />
          {copy.backToBoard}
        </AppLink>
      </header>
      {board.isPending ? (
        <p className="text-muted p-6">{copy.loading}</p>
      ) : !task ? (
        <p role="alert" className="text-danger p-6">
          {board.isError ? copy.loadFailed : copy.taskNotFound}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <TaskDetails task={task} onOpen={() => editor.openView(task)} />
          <AgentPage
            key={taskId}
            taskId={taskId}
            task={rawTask}
            onSessionExpired={onSessionExpired}
          />
        </div>
      )}
      {editor.dialogs}
    </div>
  );
};
