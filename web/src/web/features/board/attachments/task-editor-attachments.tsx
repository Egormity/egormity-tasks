import { Upload } from "lucide-react";

import type { TaskAttachment } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { TaskAttachmentsCarousel } from "./task-attachments-carousel";

export { TaskAttachmentsCarousel } from "./task-attachments-carousel";
type TaskEditorAttachmentsProps = {
  readonly attachments: readonly TaskAttachment[];
  readonly cardId?: string | undefined;
  readonly files: ReadonlyMap<string, File>;
  readonly onChooseFiles: () => void;
  readonly onRemove: (id: string) => void;
};

export const TaskEditorAttachments = ({
  attachments,
  cardId,
  files,
  onChooseFiles,
  onRemove,
}: TaskEditorAttachmentsProps) => {
  return (
    <section aria-labelledby="task-attachments-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-board-text text-xs font-medium" id="task-attachments-heading">
            {boardText("Вложения")}
          </h2>
          <p className="text-board-subtle mt-0.5 text-xs">
            {boardText("Добавьте файлы, которые помогут выполнить задачу")}
          </p>
        </div>
        <button
          className="border-board-button-border bg-board-surface text-board-button-text hover:border-board-button-border-hover hover:bg-board-button-hover focus-visible:ring-board-accent inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[11px] font-medium transition focus-visible:ring-2 focus-visible:outline-none"
          onClick={onChooseFiles}
          type="button"
        >
          <Upload aria-hidden="true" className="size-3.5" />
          {boardText("Добавить файлы")}
        </button>
      </div>

      {attachments.length > 0 && (
        <TaskAttachmentsCarousel
          attachments={attachments}
          cardId={cardId}
          editable
          files={files}
          onRemove={onRemove}
        />
      )}
    </section>
  );
};
