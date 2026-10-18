import { ApiError, request } from "@/shared/http/api";
import { taskCommentSchema, type TaskComment } from "@contracts/task-comments.js";

export const getTaskComments = async (cardId: string, signal?: AbortSignal) =>
  taskCommentSchema
    .array()
    .parse(
      await request<unknown>(
        `/board/cards/${encodeURIComponent(cardId)}/comments`,
        undefined,
        signal,
      ),
    );

export const addTaskComment = async (
  cardId: string,
  id: string,
  text: string,
  files: File[],
): Promise<TaskComment> => {
  const body = new FormData();
  body.set("id", id);
  body.set("text", text);
  files.forEach((file) => body.append("files", file));
  const response = await fetch(`/api/board/cards/${encodeURIComponent(cardId)}/comments`, {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, error.error ?? `Request failed (${response.status})`);
  }
  return taskCommentSchema.parse(await response.json());
};
