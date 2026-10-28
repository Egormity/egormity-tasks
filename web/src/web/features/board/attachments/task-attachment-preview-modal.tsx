import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/features/board/components/modal";
import type { TaskAttachment } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { getPreviewKind } from "./task-attachment-format";
import { useAttachmentObjectUrl, useTaskAttachment } from "./use-task-attachment";

type Props = {
  readonly attachments: readonly TaskAttachment[];
  readonly cardId?: string | undefined;
  readonly files: ReadonlyMap<string, File>;
  readonly initialAttachmentId?: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
};

export const TaskAttachmentPreviewModal = ({
  attachments,
  cardId,
  files,
  initialAttachmentId,
  onOpenChange,
  open,
}: Props) => {
  const attachment = attachments.find((item) => item.id === initialAttachmentId);
  const file = attachment ? files.get(attachment.id) : undefined;
  const kind = attachment && getPreviewKind(attachment.name, attachment.type);
  const { blob, loading, error } = useTaskAttachment(attachment, cardId, file, open);
  const url = useAttachmentObjectUrl(kind === "image" ? blob : undefined);
  const text = useQuery({
    queryKey: [
      "tracker-attachment-text",
      cardId,
      attachment?.id,
      attachment?.objectId,
      file?.lastModified,
    ],
    enabled: open && kind === "text" && Boolean(blob),
    queryFn: () => blob!.text(),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        nested
        className="border-board-modal-border flex flex-col overflow-hidden rounded-2xl p-0"
        style={{
          width: "calc(100vw - 2rem)",
          maxWidth: "90rem",
          height: "calc(100dvh - 2rem)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader className="border-board-section-border flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <ModalTitle className="text-board-heading truncate text-lg">
              {attachment?.name ?? boardText("Просмотр вложения")}
            </ModalTitle>
            <ModalDescription className="text-board-muted mt-1 text-xs">
              {kind === "image" ? boardText("Изображение") : boardText("Просмотр файла")}
            </ModalDescription>
          </div>
          <ModalClose
            aria-label={boardText("Закрыть просмотр")}
            className="text-board-icon hover:bg-board-input-surface grid size-9 shrink-0 place-items-center rounded-xl"
          >
            <X className="size-4" />
          </ModalClose>
        </ModalHeader>
        <div className="bg-board-canvas flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          {error || text.isError ? (
            <p role="alert" className="grid flex-1 place-items-center p-8 text-center">
              {boardText(
                "Не удалось загрузить вложение. Закройте просмотр и попробуйте снова.",
              )}
            </p>
          ) : loading ? (
            <p role="status" className="grid flex-1 place-items-center p-8 text-center">
              {boardText("Загрузка вложения…")}
            </p>
          ) : kind === "image" && url ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <img
                src={url}
                alt={attachment?.name ?? boardText("Вложение")}
                className="block max-h-full max-w-full rounded-lg object-contain"
              />
            </div>
          ) : kind === "text" && text.data !== undefined ? (
            <pre className="bg-board-heading text-board-attachment-border min-h-0 flex-1 overflow-auto rounded-lg p-4 text-sm break-words whitespace-pre-wrap">
              {text.data}
            </pre>
          ) : (
            <p className="grid flex-1 place-items-center p-8 text-center">
              {blob
                ? boardText("Загрузка предпросмотра…")
                : boardText("Предпросмотр недоступен")}
            </p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
