import { useRef, useState } from "react";
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  LoaderCircle,
  Paperclip,
  Send,
  type LucideIcon,
} from "lucide-react";
import { commentLimits } from "@contracts/task-comments.js";
import { DraftAttachments } from "@/shared/ui/DraftAttachments";
import { useAutosizeTextarea } from "@/shared/ui/useAutosizeTextarea";
import { boardText } from "../i18n/board-copy";
import { applyCommentFormat, type CommentFormat } from "./comment-format";

type FormatAction = {
  readonly format: CommentFormat;
  readonly icon: LucideIcon;
  readonly label: string;
};

const formatActions: readonly FormatAction[] = [
  { format: "bold", icon: Bold, label: "Жирный" },
  { format: "italic", icon: Italic, label: "Курсив" },
  { format: "code", icon: Code, label: "Код" },
  { format: "link", icon: Link, label: "Ссылка" },
  { format: "list", icon: List, label: "Маркированный список" },
];

const formatButtonClassName =
  "text-board-icon hover:bg-board-input-surface hover:text-board-accent focus-visible:ring-board-accent grid size-6 place-items-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40";

type CommentComposerProps = {
  readonly onSubmit: (text: string, files: File[]) => Promise<void>;
};

export const CommentComposer = ({ onSubmit }: CommentComposerProps) => {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const textarea = useAutosizeTextarea(text);

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
    try {
      await onSubmit(text, files);
      setText("");
      setFiles([]);
    } catch {
      setError(
        boardText("Не удалось отправить комментарий. Черновик сохранён, попробуйте ещё раз."),
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  const format = (kind: CommentFormat) => {
    const input = textarea.current;
    if (!input || pending) return;
    const edit = applyCommentFormat(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      kind,
    );
    setText(edit.value);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  };

  return (
    <div>
      <div
        className="border-line bg-board-canvas focus-within:border-board-accent focus-within:ring-board-accent/15 overflow-hidden rounded-lg border transition focus-within:ring-2"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          add(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="border-line/70 flex items-center gap-1 border-b px-1.5 py-1">
          <div
            aria-label={boardText("Инструменты форматирования")}
            className="flex items-center gap-0.5"
            role="group"
          >
            {formatActions.map(({ format: kind, icon: Icon, label }) => (
              <button
                key={kind}
                aria-label={boardText(label)}
                className={formatButtonClassName}
                disabled={pending}
                title={boardText(label)}
                type="button"
                onClick={() => format(kind)}
              >
                <Icon aria-hidden="true" size={13} />
              </button>
            ))}
          </div>
          <span className="text-board-subtle ml-auto pr-1 text-[0.7rem] tracking-wide">
            Markdown
          </span>
        </div>
        <DraftAttachments
          disabled={pending}
          files={files}
          removeLabel={boardText("Удалить")}
          onRemove={(index) => setFiles((value) => value.filter((_, i) => i !== index))}
        />
        <textarea
          aria-label={boardText("Комментарий")}
          className="placeholder:text-board-subtle block max-h-48 min-h-16 w-full resize-none bg-transparent px-3 py-2.5 text-xs leading-5 outline-none"
          disabled={pending}
          maxLength={commentLimits.maxText}
          placeholder={boardText("Напишите комментарий…")}
          ref={textarea}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
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
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              event.stopPropagation();
              add(Array.from(event.clipboardData.files));
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 px-2 pt-0.5 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <input
              hidden
              multiple
              ref={picker}
              type="file"
              onChange={(event) => {
                add(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <button
              aria-label={boardText("Прикрепить файл")}
              className="text-board-icon hover:bg-board-input-surface hover:text-board-accent focus-visible:ring-board-accent grid size-7 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              disabled={pending}
              title={boardText("Прикрепить файл")}
              type="button"
              onClick={() => picker.current?.click()}
            >
              <Paperclip size={15} />
            </button>
            <span className="text-board-subtle hidden text-[0.7rem] sm:block">
              Ctrl + Enter
            </span>
          </div>
          <button
            className="bg-board-accent text-board-on-accent hover:bg-board-accent-hover focus-visible:ring-board-accent inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            disabled={pending || (!text.trim() && !files.length)}
            type="button"
            onClick={() => void send()}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Send aria-hidden="true" size={13} />
            )}
            {boardText("Отправить комментарий")}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-board-danger mt-2 text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
