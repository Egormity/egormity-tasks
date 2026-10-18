import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { boardChangeSchema } from "@contracts/board.js";
import { refreshTrackerBoard } from "./tracker-query";

export const useBoardEvents = (client: QueryClient) => {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const stream = new EventSource("/api/board/events");
    stream.onmessage = (message) => {
      const change = boardChangeSchema.safeParse(JSON.parse(message.data as string));
      if (change.success) void refreshTrackerBoard(client, change.data.version);
    };
    stream.onerror = () => {
      // EventSource stops on 401/403. A normal query reports session expiry via QueryCache.
      if (stream.readyState === EventSource.CLOSED) void refreshTrackerBoard(client);
    };
    return () => stream.close();
  }, [client]);
};
