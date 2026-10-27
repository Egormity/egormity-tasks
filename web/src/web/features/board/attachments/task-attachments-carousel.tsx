import { useState } from "react";
import { toast } from "sonner";

import type { TaskAttachment } from "@/features/board/data/task-data";
import { getTrackerCardAttachmentBlob } from "@/features/board/data/tracker-api";

import { boardText } from "@/features/board/i18n/board-copy";
import { ConfirmModal } from "@/features/board/components/confirm-modal";
import { TaskAttachmentCard } from "./task-attachment-card";
import { TaskAttachmentPreviewModal } from "./task-attachment-preview-modal";

const emptyFiles: ReadonlyMap<string, File> = new Map();

type TaskAttachmentsCarouselProps = {
  readonly attachments: readonly TaskAttachment[];
  readonly cardId?: string | undefined;
  readonly editable?: boolean | undefined;
  readonly files?: ReadonlyMap<string, File> | undefined;
  readonly onRemove?: ((id: string) => void) | undefined;
};

export const TaskAttachmentsCarousel = ({
  attachments,
  cardId,
  editable = false,
  files = emptyFiles,
  onRemove,
}: TaskAttachmentsCarouselProps) => {
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<TaskAttachment | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);

  const downloadFile = (file: File, name: string) => {
    const objectUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  const handleDownload = async (attachment: TaskAttachment) => {
    const file = files.get(attachment.id);
    if (!file) {
      if (!cardId || !attachment.objectId) {
        toast.info(boardText("Файл недоступен в текущей сессии"));
        return;
      }
      if (downloadingAttachmentId) return;

      setDownloadingAttachmentId(attachment.id);
      try {
        const blob = await getTrackerCardAttachmentBlob(cardId, attachment.id);
        downloadFile(
          new File([blob], attachment.name, { type: attachment.type || blob.type }),
          attachment.name,
        );
      } catch {
        toast.error(boardText("Не удалось скачать вложение"));
      } finally {
        setDownloadingAttachmentId(null);
      }
      return;
    }

    downloadFile(file, attachment.name);
  };

  const handleRemove = () => {
    if (!pendingRemoval || !onRemove) return;

    const attachmentId = pendingRemoval.id;
    if (previewAttachmentId === attachmentId) setPreviewAttachmentId(null);
    onRemove(attachmentId);
    setPendingRemoval(null);
  };

  return (
    <>
      <ul
        aria-label={boardText("Вложения")}
        className="flex snap-x gap-1.5 overflow-x-auto pt-1 pb-1"
      >
        {attachments.map((attachment) => {
          return (
            <TaskAttachmentCard
              key={attachment.id}
              attachment={attachment}
              cardId={cardId}
              file={files.get(attachment.id)}
              downloading={downloadingAttachmentId === attachment.id}
              downloadDisabled={downloadingAttachmentId !== null}
              onPreview={() => setPreviewAttachmentId(attachment.id)}
              onDownload={() => void handleDownload(attachment)}
              onRemove={editable && onRemove ? () => setPendingRemoval(attachment) : undefined}
            />
          );
        })}
      </ul>

      <TaskAttachmentPreviewModal
        attachments={attachments}
        cardId={cardId}
        files={files}
        initialAttachmentId={previewAttachmentId ?? undefined}
        key={previewAttachmentId ?? "closed"}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachmentId(null);
        }}
        open={previewAttachmentId !== null}
      />

      {editable && (
        <ConfirmModal
          description={boardText(
            "Вы уверены, что хотите удалить файл «{0}»? Он будет убран из списка вложений этой задачи.",
            pendingRemoval?.name ?? "",
          )}
          onConfirm={handleRemove}
          onOpenChange={(open) => {
            if (!open) setPendingRemoval(null);
          }}
          open={Boolean(pendingRemoval)}
          title={boardText("Удалить вложение?")}
        />
      )}
    </>
  );
};
