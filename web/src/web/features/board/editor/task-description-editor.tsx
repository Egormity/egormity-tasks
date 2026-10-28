import { useState } from "react";

import { useAutosizeTextarea } from "@/shared/ui/useAutosizeTextarea";
import { boardText } from "@/features/board/i18n/board-copy";
import { applyMarkdownFormat, type MarkdownFormat } from "../markdown/markdown-format";
import { MarkdownToolbar } from "../markdown/MarkdownToolbar";

type TaskDescriptionEditorProps = {
  readonly initialValue: string;
  readonly maxLength?: number | undefined;
  readonly onChange: (value: string) => void;
};

export const TaskDescriptionEditor = ({
  initialValue,
  maxLength = 8000,
  onChange,
}: TaskDescriptionEditorProps) => {
  const [value, setValue] = useState(() => initialValue.slice(0, maxLength));
  const textarea = useAutosizeTextarea(value);

  const commit = (next: string) => {
    const limited = next.slice(0, maxLength);
    setValue(limited);
    onChange(limited);
    return limited;
  };

  const format = (kind: MarkdownFormat) => {
    const input = textarea.current;
    if (!input) return;
    const edit = applyMarkdownFormat(
      input.value,
      input.selectionStart,
      input.selectionEnd,
      kind,
    );
    if (edit.value.length > maxLength) return;
    const next = commit(edit.value);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(
        Math.min(edit.selectionStart, next.length),
        Math.min(edit.selectionEnd, next.length),
      );
    });
  };

  return (
    <div className="border-board-input-border bg-board-input-surface focus-within:border-board-accent focus-within:ring-board-accent/15 mt-1.5 overflow-hidden rounded-md border transition focus-within:ring-2">
      <div className="border-board-section-border bg-board-canvas flex items-center gap-1 border-b px-1.5 py-1">
        <MarkdownToolbar onFormat={format} />
        <span className="text-board-subtle ml-auto pr-1 text-[0.7rem] tracking-wide">
          Markdown
        </span>
      </div>
      <textarea
        aria-label={boardText("Описание задачи")}
        className="text-board-input-text placeholder:text-board-subtle scroll-area block max-h-[360px] min-h-[140px] w-full resize-none overflow-y-auto bg-transparent px-3 py-2 text-xs leading-5 outline-none"
        id="task-description-editor"
        maxLength={maxLength}
        placeholder={boardText("Что нужно сделать и какой результат ожидается?")}
        ref={textarea}
        value={value}
        onChange={(event) => commit(event.target.value)}
      />
    </div>
  );
};
