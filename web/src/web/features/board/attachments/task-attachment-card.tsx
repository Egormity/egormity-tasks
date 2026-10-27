import { Download, FileText, ImageOff, LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";

import type { TaskAttachment } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { formatFileSize, getPreviewKind } from "./task-attachment-format";
import { useAttachmentObjectUrl, useTaskAttachment } from "./use-task-attachment";

type Props = {
  readonly attachment: TaskAttachment;
  readonly cardId?: string | undefined;
  readonly file?: File | undefined;
  readonly downloading: boolean;
  readonly downloadDisabled: boolean;
  readonly onPreview: () => void;
  readonly onDownload: () => void;
  readonly onRemove?: (() => void) | undefined;
};

export const TaskAttachmentCard = ({
  attachment,
  cardId,
  file,
  downloading,
  downloadDisabled,
  onPreview,
  onDownload,
  onRemove,
}: Props) => {
  const kind = getPreviewKind(attachment.name, attachment.type);
  const { blob, loading } = useTaskAttachment(attachment, cardId, file, kind === "image");
  const url = useAttachmentObjectUrl(kind === "image" ? blob : undefined);
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <li
      className="border-board-attachment-border bg-board-surface flex w-60 max-w-full shrink-0 snap-start gap-2 rounded-lg border p-2"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={boardText("Открыть вложение {0}", attachment.name)}
        disabled={!kind}
        onClick={onPreview}
        className="bg-board-preview-surface text-board-preview-icon focus-visible:ring-board-accent grid h-14 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default"
      >
        {url && failedUrl !== url ? (
          <img
            src={url}
            alt={attachment.name}
            className="h-full w-full object-contain"
            onError={() => setFailedUrl(url)}
          />
        ) : loading ? (
          <LoaderCircle
            aria-label={boardText("Загрузка миниатюры")}
            className="size-4 animate-spin"
          />
        ) : kind === "image" ? (
          <ImageOff aria-label={boardText("Миниатюра недоступна")} className="size-5" />
        ) : (
          <FileText aria-hidden="true" className="size-5" />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <p
          title={attachment.name}
          className="text-board-secondary line-clamp-2 text-xs leading-4 font-medium break-all"
        >
          {attachment.name}
        </p>
        <p className="text-board-subtle mt-0.5 text-[10px]">
          {formatFileSize(attachment.size)}
        </p>
        {!attachment.objectId && !file && (
          <p className="text-board-rose mt-0.5 text-[10px]">{boardText("Файл недоступен")}</p>
        )}
        <div className="mt-auto flex gap-0.5 pt-1">
          <button
            type="button"
            aria-label={boardText("Скачать вложение {0}", attachment.name)}
            title={boardText("Скачать")}
            disabled={downloadDisabled}
            aria-busy={downloading}
            onClick={onDownload}
            className="text-board-icon hover:bg-board-button-selected focus-visible:ring-board-accent grid size-7 cursor-pointer place-items-center rounded-md focus-visible:ring-2 disabled:opacity-50"
          >
            {downloading ? (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="size-3.5" />
            )}
          </button>
          {onRemove && (
            <button
              type="button"
              aria-label={boardText("Удалить вложение {0}", attachment.name)}
              title={boardText("Удалить")}
              onClick={onRemove}
              className="text-board-rose hover:bg-board-rose-surface focus-visible:ring-board-accent grid size-7 cursor-pointer place-items-center rounded-md focus-visible:ring-2"
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
};
