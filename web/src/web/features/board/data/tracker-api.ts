import { internalTasksPolicy as policy } from "@contracts/policy.js";

import type {
  BoardSnapshot,
  LiveBoardSnapshot,
  Task as StoredTask,
  TaskEvent,
  TaskTag,
  TaskUpdate,
} from "@contracts/board.js";

import { ApiError, request } from "@/shared/http/api";

import type {
  Task,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  TaskTagTone,
  TrackerEvent,
} from "./task-data";

export type TrackerTag = TaskTag & { readonly usageCount: number };

export type TrackerTagUpdate = {
  readonly name?: string | undefined;
  readonly tone?: TaskTagTone | undefined;
};

export type CardInput = {
  readonly attachments: readonly TaskAttachment[];
  readonly description: string;
  readonly priority?: TaskPriority | undefined;
  readonly tagIds: readonly string[];
  readonly title: string;
};

export type CardUpdate = Partial<CardInput> & {
  readonly beforeId?: string | null | undefined;
  readonly status?: TaskStatus | undefined;
  readonly revision?: number | undefined;
};

// Uploads continue the revision returned by the preceding explicit save, not background refreshes.
const savedCards = new Map<string, StoredTask>();

let snapshot: BoardSnapshot = { cards: [], tags: [] };

export const resetTrackerState = () => {
  savedCards.clear();
  snapshot = { cards: [], tags: [] };
};

export const toTrackerTask = (card: StoredTask, tags: readonly TaskTag[]): Task => ({
  ...card,
  attachments: card.attachments.map((attachment) => ({
    ...attachment,
    objectId: attachment.sha256,
  })),
  tags: tags.filter((tag) => card.tagIds.includes(tag.id)),
});

const remember = (card: StoredTask) => {
  savedCards.set(card.id, card);
  return toTrackerTask(card, snapshot.tags);
};

export const getTrackerSnapshot = async (signal?: AbortSignal) => {
  const value = await request<LiveBoardSnapshot>("/board", undefined, signal);
  snapshot = value;
  return value;
};

export const selectTrackerCards = (
  board: BoardSnapshot,
  scope: "active" | "archived",
  query: string,
) => {
  const search = query.trim().toLocaleLowerCase();
  return {
    items: board.cards
      .map((card) => toTrackerTask(card, board.tags))
      .filter(
        (card) =>
          Boolean(card.archivedAt) === (scope === "archived") &&
          `${card.title}\n${card.description ?? ""}\n${card.tags.map((tag) => tag.name).join(" ")}`
            .toLocaleLowerCase()
            .includes(search),
      ),
  };
};

export const selectTrackerTags = (board: BoardSnapshot) => {
  return {
    items: board.tags.map((tag) => ({
      ...tag,
      usageCount: board.cards.filter((card) => card.tagIds.includes(tag.id)).length,
    })),
  };
};

export const getTrackerCards = async (
  scope: "active" | "archived",
  query: string,
  signal?: AbortSignal,
) => selectTrackerCards(await getTrackerSnapshot(signal), scope, query);

export const getTrackerTags = async (signal?: AbortSignal) =>
  selectTrackerTags(await getTrackerSnapshot(signal));

export const createTrackerCard = async (input: CardInput) =>
  remember(
    await request<StoredTask>("/board/cards", {
      title: input.title,
      description: input.description || null,
      priority: input.priority ?? policy.defaultTaskPriority,
      status: policy.defaultTaskStatus,
      tagIds: input.tagIds,
    }),
  );

export const updateTrackerCard = async (id: string, input: CardUpdate) => {
  if (!input.revision) throw new Error("The task changed. Reopen it before saving.");
  const { attachments, revision, ...fields } = input;
  const current = snapshot.cards.find((card) => card.id === id);
  const update: TaskUpdate = {
    ...fields,
    tagIds: fields.tagIds ? [...fields.tagIds] : undefined,
    revision,
    ...(attachments
      ? {
          attachmentIds: attachments
            .filter((a) => current?.attachments.some((item) => item.id === a.id))
            .map((a) => a.id),
        }
      : {}),
  };
  return remember(await request<StoredTask>(`/board/cards/${encodeURIComponent(id)}`, update));
};

export const uploadTrackerCardAttachment = async (
  cardId: string,
  attachmentId: string,
  file: File,
) => {
  const current = savedCards.get(cardId);
  if (!current) throw new Error("The task changed. Reopen it before saving.");
  const response = await fetch(`/api/board/cards/${encodeURIComponent(cardId)}/attachments`, {
    method: "POST",
    credentials: "same-origin",
    body: file,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Task-Revision": String(current.revision),
      "X-File-Name": encodeURIComponent(file.name),
      "X-File-Type": file.type || "application/octet-stream",
      "X-Attachment-Id": attachmentId,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string | undefined };
    throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`);
  }
  const card = remember((await response.json()) as StoredTask);
  return { attachment: card.attachments.find((a) => a.id === attachmentId)! };
};

export const getTrackerCardAttachmentBlob = async (
  cardId: string,
  attachmentId: string,
  signal?: AbortSignal,
) => {
  const response = await fetch(
    `/api/board/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { credentials: "same-origin", ...(signal ? { signal } : {}) },
  );
  if (!response.ok) throw new ApiError(response.status, "Attachment file is unavailable.");
  const blob = await response.blob();
  const attachment = snapshot.cards
    .find((card) => card.id === cardId)
    ?.attachments.find((a) => a.id === attachmentId);
  return attachment?.type ? new Blob([blob], { type: attachment.type }) : blob;
};

const setArchived = async (task: Task, archived: boolean) =>
  remember(
    await request<StoredTask>(`/board/cards/${encodeURIComponent(task.id)}`, {
      revision: task.revision,
      archived,
    }),
  );

export const archiveTrackerCard = (task: Task) => setArchived(task, true);

export const restoreTrackerCard = (task: Task) => setArchived(task, false);

export const createTrackerTag = async (name: string, tone: TaskTagTone = "green") => ({
  ...(await request<TaskTag>("/board/tags", { name, tone })),
  usageCount: 0,
});

export const updateTrackerTag = async (
  id: string,
  input: TrackerTagUpdate,
): Promise<TrackerTag> => {
  const tag = snapshot.tags.find((item) => item.id === id);
  if (!tag) throw new Error("Tag not found.");
  return {
    ...(await request<TaskTag>(`/board/tags/${encodeURIComponent(id)}`, {
      name: input.name ?? tag.name,
      tone: input.tone ?? tag.tone,
    })),
    usageCount: snapshot.cards.filter((card) => card.tagIds.includes(id)).length,
  };
};

export const deleteTrackerTag = (id: string) =>
  request<{ id: string; removedCards: number }>(
    `/board/tags/${encodeURIComponent(id)}/remove`,
    {},
  );

export const getTrackerEvents = async (
  id: string,
  signal?: AbortSignal,
): Promise<{ items: TrackerEvent[] }> => ({
  items: await request<TaskEvent[]>(
    `/board/cards/${encodeURIComponent(id)}/events`,
    undefined,
    signal,
  ),
});
