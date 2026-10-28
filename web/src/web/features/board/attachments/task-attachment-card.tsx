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
  const unavailable = !attachment.objectId && !file;
  return (
    <li
      className="group border-board-attachment-border bg-board-preview-surface relative size-20 shrink-0 snap-start overflow-hidden rounded-md border"
      onClick={(event) => event.stopPropagation()}
      title={`${attachment.name} · ${
        unavailable ? boardText("Файл недоступен") : formatFileSize(attachment.size)
      }`}
    >
      <button
        type="button"
        aria-label={boardText("Открыть вложение {0}", attachment.name)}
        disabled={!kind}
        onClick={onPreview}
        className="text-board-preview-icon focus-visible:ring-board-accent absolute inset-0 grid size-full cursor-pointer place-items-center focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none disabled:cursor-default"
      >
        {url && failedUrl !== url ? (
          <img
            src={url}
            alt={attachment.name}
            className="h-full w-full object-cover"
            onError={() => setFailedUrl(url)}
          />
        ) : loading ? (
          <LoaderCircle
            aria-label={boardText("Загрузка миниатюры")}
            className="size-4 animate-spin"
          />
        ) : kind === "image" ? (
          <ImageOff
            aria-label={boardText("Миниатюра недоступна")}
            className={`size-5 ${unavailable ? "text-board-rose" : ""}`}
          />
        ) : (
          <FileText
            aria-hidden="true"
            className={`size-5 ${unavailable ? "text-board-rose" : ""}`}
          />
        )}
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/90 via-black/50 to-transparent px-1.5 pt-3 pb-1">
        <p className="truncate text-[10px] leading-3 font-medium text-white">
          {attachment.name}
        </p>
      </div>
      <div className="pointer-events-none absolute top-1 right-1 z-20 flex gap-0.5 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 max-sm:pointer-events-auto max-sm:opacity-100">
        <button
          type="button"
          aria-label={boardText("Скачать вложение {0}", attachment.name)}
          title={boardText("Скачать")}
          disabled={downloadDisabled}
          aria-busy={downloading}
          onClick={onDownload}
          className="focus-visible:ring-board-accent grid size-5 cursor-pointer place-items-center rounded-sm bg-black/60 text-white hover:bg-black/90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          {downloading ? (
            <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />
          ) : (
            <Download aria-hidden="true" className="size-3" />
          )}
        </button>
        {onRemove && (
          <button
            type="button"
            aria-label={boardText("Удалить вложение {0}", attachment.name)}
            title={boardText("Удалить")}
            onClick={onRemove}
            className="focus-visible:ring-board-accent grid size-5 cursor-pointer place-items-center rounded-sm bg-black/60 text-white hover:bg-black/90 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Trash2 aria-hidden="true" className="size-3" />
          </button>
        )}
      </div>
    </li>
  );
};
