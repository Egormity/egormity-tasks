import { Check, Trash2 } from "lucide-react";
import { useState } from "react";

import type { BoardDivider } from "@contracts/board-columns.js";
import { boardText } from "@/features/board/i18n/board-copy";

export const BoardDividerItem = ({
  divider,
  busy,
  onSave,
  onRemove,
}: {
  readonly divider: BoardDivider;
  readonly busy: boolean;
  readonly onSave: (title: string) => void;
  readonly onRemove: () => void;
}) => {
  const [title, setTitle] = useState(divider.title);
  const dirty = title.trim() !== divider.title;

  return (
    <div className="flex min-h-9 items-center gap-1.5 px-1">
      <span aria-hidden="true" className="bg-board-divider h-px min-w-3 flex-1" />
      <input
        aria-label={boardText("Название раздела")}
        className="border-board-input-border bg-board-canvas text-board-secondary focus:border-board-accent w-32 rounded border px-2 py-1 text-center text-[11px] outline-none"
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      <button
        aria-label={boardText("Сохранить название раздела")}
        className="text-board-icon hover:bg-board-selected grid size-6 shrink-0 place-items-center rounded disabled:opacity-40"
        disabled={busy || !dirty || !title.trim()}
        onClick={() => onSave(title.trim())}
        title={boardText("Сохранить название раздела")}
        type="button"
      >
        <Check aria-hidden="true" className="size-3.5" />
      </button>
      <button
        aria-label={boardText("Удалить раздел")}
        className="text-board-icon hover:text-board-rose hover:bg-board-rose-surface grid size-6 shrink-0 place-items-center rounded disabled:opacity-40"
        disabled={busy}
        onClick={onRemove}
        title={boardText("Удалить раздел")}
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </button>
      <span aria-hidden="true" className="bg-board-divider h-px min-w-3 flex-1" />
    </div>
  );
};
