import { AlertTriangle, LoaderCircle, X } from "lucide-react";

import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "./modal";

import { boardText } from "@/features/board/i18n/board-copy";

type ConfirmModalProps = {
  readonly confirmLabel?: string | undefined;
  readonly description: string;
  readonly isPending?: boolean | undefined;
  readonly pendingLabel?: string | undefined;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly title: string;
};

export const ConfirmModal = ({
  confirmLabel = boardText("Удалить"),
  description,
  isPending = false,
  onConfirm,
  onOpenChange,
  open,
  pendingLabel = boardText("Удаление…"),
  title,
}: ConfirmModalProps) => (
  <Modal open={open} onOpenChange={onOpenChange}>
    <ModalContent className="border-board-modal-border max-w-md rounded-2xl p-6" nested>
      <ModalHeader>
        <div className="flex items-start gap-3">
          <span className="bg-board-rose-surface text-board-rose grid size-10 shrink-0 place-items-center rounded-xl">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </span>
          <div>
            <ModalTitle className="text-board-heading text-xl tracking-[-0.03em]">
              {title}
            </ModalTitle>
            <ModalDescription className="text-board-muted mt-1 leading-6">
              {description}
            </ModalDescription>
          </div>
          <ModalClose
            aria-label={boardText("Закрыть окно")}
            className="text-board-icon hover:bg-board-input-surface hover:text-board-accent-hover ml-auto grid size-9 shrink-0 place-items-center rounded-lg transition"
          >
            <X aria-hidden="true" className="size-4" />
          </ModalClose>
        </div>
      </ModalHeader>
      <ModalFooter>
        <ModalClose asChild>
          <button
            className="border-board-input-border text-board-button-muted min-h-10 rounded-xl border px-4 text-sm font-semibold"
            type="button"
          >
            {boardText("Отмена")}
          </button>
        </ModalClose>
        <button
          aria-busy={isPending}
          className="bg-board-rose text-board-on-accent hover:bg-board-danger inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={onConfirm}
          type="button"
        >
          {isPending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
          {isPending ? pendingLabel : confirmLabel}
        </button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
