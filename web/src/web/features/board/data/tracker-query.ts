import { MutationCache, QueryCache, QueryClient, queryOptions } from "@tanstack/react-query";

import { getTrackerSnapshot } from "./tracker-api";

export const trackerBoardQuery = queryOptions({
  queryKey: ["tracker", "board"] as const,
  queryFn: ({ signal }) => getTrackerSnapshot(signal),
  staleTime: Infinity,
});

export const createBoardQueryClient = (onError: (error: Error) => void) =>
  new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: false } },
  });

type Refresh = { again: boolean; version: string | undefined; promise: Promise<void> };
const refreshes = new WeakMap<QueryClient, Refresh>();

/** Coalesce SSE and local save notifications, without losing changes during an active read. */
export const refreshTrackerBoard = (client: QueryClient, version?: string): Promise<void> => {
  const currentVersion = () => {
    const query = client.getQueryState(trackerBoardQuery.queryKey);
    return query?.status === "success" ? query.data?.version : undefined;
  };
  if (version && currentVersion() === version) return Promise.resolve();
  const active = refreshes.get(client);
  if (active) {
    active.again = true;
    active.version = version;
    return active.promise;
  }
  const state: Refresh = { again: true, version, promise: Promise.resolve() };
  refreshes.set(client, state);
  state.promise = (async () => {
    while (state.again) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      state.again = false;
      if (!state.version || currentVersion() !== state.version)
        await client.invalidateQueries({ queryKey: trackerBoardQuery.queryKey });
    }
  })().finally(() => refreshes.delete(client));
  return state.promise;
};
