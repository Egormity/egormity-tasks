import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, MessageSquare, RotateCcw, type LucideIcon } from "lucide-react";
import type { TaskComment } from "@contracts/task-comments.js";

import type { BoardColumn, TrackerEvent } from "../data/task-data";
import { boardText } from "../i18n/board-copy";
import { refreshTrackerBoard, trackerBoardQuery } from "../data/tracker-query";
import { addTaskComment, getTaskComments } from "../comments/comment-api";
import { CommentComposer } from "../comments/comment-composer";
import { CommentItem } from "../comments/comment-item";
import { HistoryEntry } from "../editor/task-editor-history";

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

type ActivityEmptyProps = {
  readonly hint?: string | undefined;
  readonly icon: "comments" | "history";
  readonly message: string;
};

const ActivityEmpty = ({ hint, icon, message }: ActivityEmptyProps) => {
  const Icon = icon === "history" ? History : MessageSquare;
  return (
    <div className="border-line/80 bg-board-canvas/40 flex flex-col items-center gap-1 rounded-lg border border-dashed px-3 py-5 text-center">
      <Icon aria-hidden="true" className="text-board-subtle mb-0.5" size={18} />
      <p className="text-board-muted text-xs">{message}</p>
      {hint && <p className="text-board-subtle text-[0.72rem]">{hint}</p>}
    </div>
  );
};

type ToggleButtonProps = {
  readonly count: number;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
};

const ToggleButton = ({ count, icon: Icon, label, pressed, onToggle }: ToggleButtonProps) => (
  <button
    aria-pressed={pressed}
    className={`focus-visible:ring-board-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none ${
      pressed
        ? "border-board-accent-border bg-board-accent/10 text-board-accent"
        : "border-board-border bg-board-canvas text-board-muted hover:border-board-border-hover hover:text-board-text"
    }`}
    type="button"
    onClick={onToggle}
  >
    <Icon aria-hidden="true" size={14} />
    {label}
    {count > 0 && (
      <span
        className={`rounded-full px-1.5 py-px text-[0.7rem] font-medium tabular-nums ${
          pressed
            ? "bg-board-accent/15 text-board-accent"
            : "bg-board-count-surface text-board-count"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

type ActivityItem =
  | {
      readonly comment: TaskComment;
      readonly createdAt: string;
      readonly id: string;
      readonly kind: "comment";
    }
  | {
      readonly createdAt: string;
      readonly event: TrackerEvent;
      readonly id: string;
      readonly kind: "event";
    };

const timestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

type TaskActivityProps = {
  readonly cardId: string;
  readonly columns: readonly BoardColumn[];
  readonly events: readonly TrackerEvent[];
};

export const TaskActivity = ({ cardId, columns, events }: TaskActivityProps) => {
  const client = useQueryClient();
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const [showComments, setShowComments] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
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

  // A comment is already its own feed entry; its comment_added event would duplicate it.
  const historyEvents = showComments
    ? events.filter((event) => event.type !== "comment_added")
    : events;
  const items: ActivityItem[] = [
    ...(showComments
      ? (comments.data ?? []).map((comment): ActivityItem => ({
          comment,
          createdAt: comment.createdAt,
          id: comment.id,
          kind: "comment",
        }))
      : []),
    ...(showHistory
      ? historyEvents.map((event): ActivityItem => ({
          createdAt: event.createdAt,
          event,
          id: event.id,
          kind: "event",
        }))
      : []),
  ].sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt));

  const commentsLoading = showComments && comments.isPending;
  const commentsFailed = showComments && comments.isError;
  const isEmpty = !commentsLoading && !commentsFailed && items.length === 0;

  return (
    <section aria-label={boardText("Активность")} className="border-line border-t pt-3">
      <div
        aria-label={boardText("Активность")}
        className="mb-2 flex flex-wrap items-center gap-1.5"
        role="group"
      >
        <ToggleButton
          count={comments.data?.length ?? 0}
          icon={MessageSquare}
          label={boardText("Комментарии")}
          pressed={showComments}
          onToggle={() => setShowComments((current) => !current)}
        />
        <ToggleButton
          count={historyEvents.length}
          icon={History}
          label={boardText("История")}
          pressed={showHistory}
          onToggle={() => setShowHistory((current) => !current)}
        />
      </div>
      <div className="space-y-3">
        {commentsFailed && (
          <button
            className="border-board-danger-border bg-board-rose-surface text-board-danger flex w-full items-center gap-1.5 rounded-md border px-3 py-2 text-left text-xs"
            type="button"
            onClick={() => void comments.refetch()}
          >
            <RotateCcw aria-hidden="true" size={14} />
            {boardText("Не удалось загрузить комментарии. Повторить")}
          </button>
        )}
        {commentsLoading && <CommentsSkeleton />}
        {isEmpty &&
          (!showComments && !showHistory ? (
            <ActivityEmpty
              icon="history"
              message={boardText("Включите комментарии или историю, чтобы увидеть активность.")}
            />
          ) : showComments && !showHistory ? (
            <ActivityEmpty
              hint={boardText("Начните обсуждение. Поддерживается Markdown.")}
              icon="comments"
              message={boardText("Комментариев пока нет")}
            />
          ) : !showComments && showHistory ? (
            <ActivityEmpty icon="history" message={boardText("История пока пуста")} />
          ) : (
            <ActivityEmpty
              icon="comments"
              message={boardText("Пока нет комментариев и событий.")}
            />
          ))}
        {items.length > 0 && (
          <ol aria-label={boardText("Лента активности")} className="space-y-2">
            {items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                {item.kind === "comment" ? (
                  <CommentItem cardId={cardId} comment={item.comment} />
                ) : (
                  <HistoryEntry columns={columns} event={item.event} />
                )}
              </li>
            ))}
          </ol>
        )}
        {showComments && <CommentComposer onSubmit={submit} />}
      </div>
    </section>
  );
};
