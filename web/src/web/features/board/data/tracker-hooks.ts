import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { TaskTagTone } from "./task-data";
import {
  type CardInput,
  type CardUpdate,
  archiveTrackerCard,
  createTrackerColumn,
  createTrackerDivider,
  createTrackerCard,
  createTrackerTag,
  deleteTrackerColumn,
  deleteTrackerDivider,
  deleteTrackerTag,
  getTrackerEvents,
  selectTrackerCards,
  selectTrackerTags,
  restoreTrackerCard,
  reorderTrackerColumns,
  updateTrackerCard,
  updateTrackerColumn,
  updateTrackerDivider,
  updateTrackerTag,
  uploadTrackerCardAttachment,
} from "./tracker-api";
import { refreshTrackerBoard, trackerBoardQuery } from "./tracker-query";

export const useTrackerCards = (scope: "active" | "archived", query: string) =>
  useQuery({
    ...trackerBoardQuery,
    select: (board) => selectTrackerCards(board, scope, query),
  });

export const useTrackerTags = () =>
  useQuery({ ...trackerBoardQuery, select: selectTrackerTags });

export const useTrackerEvents = (cardId?: string) => {
  const revision = useQuery({
    ...trackerBoardQuery,
    enabled: Boolean(cardId),
    select: (board) => board.cards.find((card) => card.id === cardId)?.revision,
  }).data;
  return useQuery({
    enabled: Boolean(cardId && revision),
    queryFn: ({ signal }) => getTrackerEvents(cardId!, signal),
    queryKey: ["tracker", "events", cardId, revision],
    staleTime: Infinity,
  });
};

const invalidateTracker = refreshTrackerBoard;

export type BoardConfigurationAction =
  | { readonly type: "create-column"; readonly input: { label: string; accent: string } }
  | {
      readonly type: "update-column";
      readonly id: string;
      readonly input: { label: string; accent: string };
    }
  | { readonly type: "reorder-columns"; readonly ids: readonly string[] }
  | { readonly type: "delete-column"; readonly id: string }
  | { readonly type: "add-divider"; readonly title: string; readonly columnId: string }
  | { readonly type: "update-divider"; readonly id: string; readonly title: string }
  | { readonly type: "delete-divider"; readonly id: string };

export const useBoardConfiguration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: BoardConfigurationAction) => {
      if (action.type === "create-column") return createTrackerColumn(action.input);
      if (action.type === "update-column") return updateTrackerColumn(action.id, action.input);
      if (action.type === "reorder-columns") return reorderTrackerColumns(action.ids);
      if (action.type === "delete-column") return deleteTrackerColumn(action.id);
      if (action.type === "add-divider")
        return createTrackerDivider({ title: action.title, columnId: action.columnId });
      if (action.type === "update-divider")
        return updateTrackerDivider(action.id, action.title);
      return deleteTrackerDivider(action.id);
    },
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useCreateTrackerCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CardInput) => createTrackerCard(input),
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useUpdateTrackerCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CardUpdate }) =>
      updateTrackerCard(id, input),
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useUploadTrackerCardAttachment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      attachmentId,
      file,
    }: {
      cardId: string;
      attachmentId: string;
      file: File;
    }) => uploadTrackerCardAttachment(cardId, attachmentId, file),
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useArchiveTrackerCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveTrackerCard,
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useRestoreTrackerCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreTrackerCard,
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useCreateTrackerTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, tone }: { name: string; tone?: TaskTagTone | undefined }) =>
      createTrackerTag(name, tone),
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useUpdateTrackerTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string | undefined; tone?: TaskTagTone | undefined };
    }) => updateTrackerTag(id, input),
    onSuccess: () => invalidateTracker(queryClient),
  });
};

export const useDeleteTrackerTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTrackerTag,
    onSuccess: () => invalidateTracker(queryClient),
  });
};
