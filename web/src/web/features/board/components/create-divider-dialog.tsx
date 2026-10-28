import { X } from "lucide-react";
import { useEffect, useState } from "react";

import type { BoardColumn } from "@/features/board/data/task-data";
import { boardText } from "@/features/board/i18n/board-copy";
import { Select } from "@/shared/ui/Select";
import { Modal, ModalClose, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "./modal";

type CreateDividerDialogProps = {
  readonly open: boolean;
  readonly columns: readonly BoardColumn[];
  readonly initialTitle: string;
  readonly initialColumnId: string;
  readonly busy: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (input: { title: string; columnId: string }) => void;
};

export const CreateDividerDialog = ({
  open,
  columns,
  initialTitle,
  initialColumnId,
  busy,
  onOpenChange,
  onCreate,
}: CreateDividerDialogProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [columnId, setColumnId] = useState(initialColumnId);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setColumnId(initialColumnId);
  }, [initialColumnId, initialTitle, open]);

  const selectedColumnExists = columns.some((column) => column.id === columnId);
  const canCreate = Boolean(title.trim() && selectedColumnExists && !busy);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        className="border-board-modal-border rounded-xl p-4"
        style={{ maxWidth: 420 }}
      >
        <ModalHeader className="flex flex-row items-center justify-between">
          <ModalTitle className="text-board-heading text-sm font-semibold">
            {boardText("Создать разделитель")}
          </ModalTitle>
          <ModalClose
            aria-label={boardText("Закрыть окно")}
            className="text-board-icon hover:bg-board-selected rounded p-1"
          >
            <X aria-hidden="true" className="size-4" />
          </ModalClose>
        </ModalHeader>

        <form
          className="mt-3 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) onCreate({ title: title.trim(), columnId });
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-board-secondary text-[11px] font-medium">
              {boardText("Название раздела")}
            </span>
            <input
              autoFocus
              className="border-board-input-border bg-board-canvas text-board-input-text focus:border-board-accent h-8 w-full rounded-md border px-2.5 text-xs outline-none"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>

          <Select
            label={boardText("Колонка")}
            value={columnId}
            options={columns.map((column) => ({
              value: column.id,
              label: boardText(column.label),
            }))}
            onChange={setColumnId}
            disabled={busy || columns.length === 0}
            className="border-board-input-border bg-board-canvas text-board-input-text focus-visible:border-board-accent focus-visible:ring-board-accent rounded-md text-xs"
          />

          <ModalFooter className="border-board-divider border-t pt-2.5">
            <ModalClose asChild>
              <button
                className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover h-7 rounded-md border px-2.5 text-[11px] font-medium disabled:opacity-50"
                disabled={busy}
                type="button"
              >
                {boardText("Отмена")}
              </button>
            </ModalClose>
            <button
              className="bg-board-accent text-board-on-accent hover:bg-board-accent-hover h-7 rounded-md px-2.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canCreate}
              type="submit"
            >
              {boardText("Создать разделитель")}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
