import type { TaskComment } from "@contracts/task-comments.js";

import { MarkdownText } from "@/shared/markdown/MarkdownText";
import { TaskAttachmentsCarousel } from "../attachments/task-attachments-carousel";

const initials = (name: string) => {
  const letters = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("");
  return letters.toLocaleUpperCase() || "?";
};

const formatCommentTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(document.documentElement.lang, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

type CommentItemProps = {
  readonly cardId: string;
  readonly comment: TaskComment;
};

export const CommentItem = ({ cardId, comment }: CommentItemProps) => (
  <article className="border-line bg-board-canvas/60 rounded-lg border px-3 py-2.5">
    <div className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="bg-board-accent/10 text-board-accent border-board-accent/15 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-[0.68rem] font-semibold tracking-wide select-none"
      >
        {initials(comment.author.name)}
      </span>
      <div className="min-w-0 flex-1">
        <header className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-board-heading text-xs font-semibold">
            {comment.author.name}
          </span>
          <time className="text-board-muted text-[0.72rem]" dateTime={comment.createdAt}>
            {formatCommentTime(comment.createdAt)}
          </time>
        </header>
        {comment.text && <MarkdownText className="text-xs" text={comment.text} />}
        {comment.attachments.length > 0 && (
          <div className="mt-2">
            <TaskAttachmentsCarousel
              cardId={cardId}
              attachments={comment.attachments.map((file) => ({
                ...file,
                objectId: file.sha256,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  </article>
);
