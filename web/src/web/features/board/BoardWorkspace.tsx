import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/http/api";
import { localizeError } from "@/shared/http/errors";
import { usePreferences } from "@/shared/i18n/preferences";

import { BoardPage } from "./board-page";
import { resetTrackerState } from "@/features/board/data/tracker-api";
import { createBoardQueryClient } from "@/features/board/data/tracker-query";
import { useBoardEvents } from "@/features/board/data/use-board-events";

export const BoardWorkspace = ({
  archived,
  onSessionExpired,
}: {
  archived: boolean;
  onSessionExpired: () => void;
}) => {
  const { locale } = usePreferences();
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
      <div className="bg-board-canvas min-h-0 min-w-0 flex-1 overflow-auto" lang={locale}>
        <BoardPage archived={archived} />
      </div>
    </QueryClientProvider>
  );
};
