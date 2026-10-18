import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";

import { ApiError } from "@/shared/http/api";
import { localizeError } from "@/shared/http/errors";
import { usePreferences } from "@/shared/i18n/preferences";

import { BoardPage } from "./board-page";
import { resetTrackerState } from "@/features/board/data/tracker-api";
import { createBoardQueryClient } from "@/features/board/data/tracker-query";
import { useBoardEvents } from "@/features/board/data/use-board-events";
import { readWorkspaceLocation } from "@/app/navigation";
import { TaskDiscussion } from "@/features/board/discussion/TaskDiscussion";

export const BoardWorkspace = ({ onSessionExpired }: { onSessionExpired: () => void }) => {
  const { theme, locale } = usePreferences();
  const [location, setLocation] = useState(readWorkspaceLocation);
  useEffect(() => {
    const change = () => setLocation(readWorkspaceLocation());
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  const [client] = useState(() => {
    const onError = (error: Error) => {
      if (error instanceof ApiError && [401, 403].includes(error.status)) onSessionExpired();
      else
        toast.error(
          localizeError(error.message, document.documentElement.lang === "en" ? "en" : "ru"),
        );
    };
    return createBoardQueryClient(onError);
  });
  useBoardEvents(client);
  useEffect(
    () => () => {
      client.clear();
      resetTrackerState();
    },
    [client],
  );
  return (
    <QueryClientProvider client={client}>
      <div
        className={`bg-board-canvas min-h-0 min-w-0 flex-1 ${location.taskId ? "flex overflow-hidden" : "overflow-auto"}`}
        lang={locale}
      >
        {location.taskId ? (
          <TaskDiscussion
            key={location.taskId}
            taskId={location.taskId}
            chatId={location.chatId}
            onSessionExpired={onSessionExpired}
          />
        ) : (
          <BoardPage />
        )}
      </div>
      <Toaster theme={theme} richColors closeButton />
    </QueryClientProvider>
  );
};
