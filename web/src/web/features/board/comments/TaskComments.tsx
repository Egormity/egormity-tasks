import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, RotateCcw } from "lucide-react";
import { boardText } from "../i18n/board-copy";
import { refreshTrackerBoard, trackerBoardQuery } from "../data/tracker-query";
import { addTaskComment, getTaskComments } from "./comment-api";
import { CommentComposer } from "./comment-composer";
import { CommentItem } from "./comment-item";

const CommentsSkeleton = () => (
  <div aria-busy="true" className="space-y-2">
    <span className="sr-only" role="status">
      {boardText("Загрузка комментариев…")}
    </span>
    {[0, 1].map((row) => (
      <div
        key={row}
        className="border-line bg-board-canvas/60 flex animate-pulse gap-2.5 rounded-lg border px-3 py-2.5"
      >
        <span className="bg-board-count-surface size-7 shrink-0 rounded-full" />
        <span className="block flex-1 space-y-2 py-1">
          <span className="bg-board-count-surface block h-2 w-24 rounded-full" />
          <span className="bg-board-count-surface block h-2 w-3/4 rounded-full" />
        </span>
      </div>
    ))}
  </div>
);

const CommentsEmpty = () => (
  <div className="border-line/80 bg-board-canvas/40 flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center">
    <MessageSquare aria-hidden="true" className="text-board-subtle mb-0.5" size={18} />
    <p className="text-board-muted text-xs">{boardText("Комментариев пока нет")}</p>
    <p className="text-board-subtle text-[0.72rem]">
      {boardText("Начните обсуждение. Поддерживается Markdown.")}
    </p>
  </div>
);

export const TaskComments = ({ cardId }: { cardId: string }) => {
  const client = useQueryClient();
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const revision = useQuery({
    ...trackerBoardQuery,
    select: (board) => board.cards.find((card) => card.id === cardId)?.revision,
  }).data;
  const comments = useQuery({
    queryKey: ["tracker", "comments", cardId, revision],
    queryFn: ({ signal }) => getTaskComments(cardId, signal),
    placeholderData: (previous) => previous,
    staleTime: Infinity,
  });

  const submit = async (text: string, files: File[]) => {
    const signature = JSON.stringify([
      text.trim(),
      files.map((file) => [file.name, file.size, file.type, file.lastModified]),
    ]);
    const submissionId =
      submission.current?.signature === signature ? submission.current.id : crypto.randomUUID();
    submission.current = { signature, id: submissionId };
    await addTaskComment(cardId, submissionId, text, files);
    submission.current = null;
    await Promise.all([comments.refetch(), refreshTrackerBoard(client)]);
  };

  return (
    <section aria-label={boardText("Комментарии")} className="border-line border-t pt-4">
      <h2 className="text-board-heading mb-3 flex items-center gap-1.5 text-xs font-semibold">
        <MessageSquare aria-hidden="true" className="text-board-icon" size={16} />
        {boardText("Комментарии")}
        {comments.data?.length ? (
          <span className="bg-board-count-surface text-board-count rounded-full px-1.5 py-px text-[0.7rem] font-medium tabular-nums">
            {comments.data.length}
          </span>
        ) : null}
      </h2>
      <div className="space-y-3">
        {comments.isError && (
          <button
            className="border-board-danger-border bg-board-rose-surface text-board-danger flex w-full items-center gap-1.5 rounded-md border px-3 py-2 text-left text-xs"
            type="button"
            onClick={() => void comments.refetch()}
          >
            <RotateCcw aria-hidden="true" size={14} />
            {boardText("Не удалось загрузить комментарии. Повторить")}
          </button>
        )}
        {comments.isPending && <CommentsSkeleton />}
        {comments.data?.length === 0 && <CommentsEmpty />}
        {comments.data && comments.data.length > 0 && (
          <div className="space-y-2">
            {comments.data.map((comment) => (
              <CommentItem key={comment.id} cardId={cardId} comment={comment} />
            ))}
          </div>
        )}
        <CommentComposer onSubmit={submit} />
      </div>
    </section>
  );
};
