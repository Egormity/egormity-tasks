import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MessageSquare, Paperclip } from "lucide-react";
import { commentLimits } from "@contracts/task-comments.js";
import { DraftAttachments } from "@/shared/ui/DraftAttachments";
import { useAutosizeTextarea } from "@/shared/ui/useAutosizeTextarea";
import { TaskAttachmentsCarousel } from "../attachments/task-attachments-carousel";
import { boardText } from "../i18n/board-copy";
import { refreshTrackerBoard, trackerBoardQuery } from "../data/tracker-query";
import { addTaskComment, getTaskComments } from "./comment-api";

export const TaskComments = ({ cardId }: { cardId: string }) => {
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<{ signature: string; id: string } | null>(null);
  const sending = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const textarea = useAutosizeTextarea(text);
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
  const add = (incoming: File[]) => {
    if (pending) return;
    const next = [...files, ...incoming];
    if (
      next.length > commentLimits.maxFiles ||
      next.some((file) => !file.size) ||
      next.reduce((sum, file) => sum + file.size, 0) > commentLimits.maxBytes
    ) {
      setError(boardText("До 10 непустых файлов, не более 20 МБ суммарно."));
      return;
    }
    setFiles(next);
    setError("");
  };
  const send = async () => {
    if (sending.current || (!text.trim() && !files.length)) return;
    sending.current = true;
    setPending(true);
    setError("");
    const signature = JSON.stringify([
      text.trim(),
      files.map((file) => [file.name, file.size, file.type, file.lastModified]),
    ]);
    if (submission.current?.signature !== signature)
      submission.current = { signature, id: crypto.randomUUID() };
    try {
      await addTaskComment(cardId, submission.current.id, text, files);
      setText("");
      setFiles([]);
      submission.current = null;
      await Promise.all([comments.refetch(), refreshTrackerBoard(client)]);
    } catch {
      setError(
        boardText("Не удалось отправить комментарий. Черновик сохранён, попробуйте ещё раз."),
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  };
  return (
    <section
      aria-label={boardText("Комментарии")}
      className="border-line space-y-2.5 border-t pt-3"
    >
      <h2 className="flex items-center gap-2 text-xs font-semibold">
        <MessageSquare size={17} />
        {boardText("Комментарии")}
        {comments.data?.length ? (
          <span className="text-muted font-normal">{comments.data.length}</span>
        ) : null}
      </h2>
      {comments.isPending && (
        <p role="status" className="text-muted text-xs">
          {boardText("Загрузка комментариев…")}
        </p>
      )}
      {comments.isError && (
        <button
          type="button"
          className="text-accent text-sm"
          onClick={() => void comments.refetch()}
        >
          {boardText("Не удалось загрузить комментарии. Повторить")}
        </button>
      )}
      {comments.data?.length === 0 && (
        <p className="text-muted text-xs">{boardText("Комментариев пока нет")}</p>
      )}
      <div className="space-y-3">
        {comments.data?.map((comment) => (
          <article key={comment.id} className="border-line bg-canvas rounded-md border p-2.5">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold">{comment.author.name}</span>
              <time className="text-muted" dateTime={comment.createdAt}>
                {new Date(comment.createdAt).toLocaleString(document.documentElement.lang, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
            </header>
            {comment.text && (
              <p className="text-xs leading-5 whitespace-pre-wrap wrap-anywhere">
                {comment.text}
              </p>
            )}
            {comment.attachments.length > 0 && (
              <TaskAttachmentsCarousel
                cardId={cardId}
                attachments={comment.attachments.map((file) => ({
                  ...file,
                  objectId: file.sha256,
                }))}
              />
            )}
          </article>
        ))}
      </div>
      <div
        className="border-line bg-canvas focus-within:border-accent overflow-hidden rounded-xl border"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          add(Array.from(event.dataTransfer.files));
        }}
      >
        <DraftAttachments
          removeLabel={boardText("Удалить")}
          files={files}
          disabled={pending}
          onRemove={(index) => setFiles((value) => value.filter((_, i) => i !== index))}
        />
        <textarea
          ref={textarea}
          aria-label={boardText("Комментарий")}
          placeholder={boardText("Напишите комментарий…")}
          className="block max-h-40 min-h-14 w-full resize-none bg-transparent px-2.5 py-2 text-xs leading-5 outline-none"
          rows={2}
          maxLength={commentLimits.maxText}
          disabled={pending}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              event.stopPropagation();
              add(Array.from(event.clipboardData.files));
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 p-2">
          <input
            type="file"
            hidden
            multiple
            ref={picker}
            onChange={(event) => {
              add(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <button
            type="button"
            aria-label={boardText("Прикрепить файл")}
            title={boardText("Прикрепить файл")}
            className="text-muted grid size-7 place-items-center rounded-lg hover:bg-accent/10"
            disabled={pending}
            onClick={() => picker.current?.click()}
          >
            <Paperclip size={15} />
          </button>
          <span className="text-muted hidden text-xs sm:block">Ctrl + Enter</span>
          <button
            type="button"
            className="bg-accent text-on-accent ml-auto flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs disabled:opacity-40"
            disabled={pending || (!text.trim() && !files.length)}
            onClick={() => void send()}
          >
            {pending && <LoaderCircle size={15} className="animate-spin" />}
            {boardText("Отправить комментарий")}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </section>
  );
};
