import { ArrowLeft, ArrowRight, Download, SeparatorHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { BoardColumn } from "@/features/board/data/task-data";
import { colorInputValue } from "@/features/board/color-picker-utils";
import { boardText } from "@/features/board/i18n/board-copy";
import { Modal, ModalClose, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "./modal";

type BoardColumnSettingsModalProps = {
  readonly open: boolean;
  readonly column: BoardColumn | null;
  readonly columnIndex: number;
  readonly columnCount: number;
  readonly taskCount: number;
  readonly busy: boolean;
  readonly exporting: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (input: { label: string; accent: string }) => void;
  readonly onMove: (offset: -1 | 1) => void;
  readonly onDelete: () => void;
  readonly onExport: () => void;
  readonly onAddDivider: () => void;
};

export const BoardColumnSettingsModal = ({
  open,
  column,
  columnIndex,
  columnCount,
  taskCount,
  busy,
  exporting,
  onOpenChange,
  onSave,
  onMove,
  onDelete,
  onExport,
  onAddDivider,
}: BoardColumnSettingsModalProps) => {
  const [label, setLabel] = useState("");
  const [accent, setAccent] = useState("#b9bfca");

  useEffect(() => {
    setLabel(column?.label ?? "");
    setAccent(colorInputValue(column?.accent ?? "var(--color-board-backlog)", "#b9bfca"));
  }, [column, open]);

  const title = column ? "Настройки колонки" : "Новая колонка";

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        className="border-board-modal-border rounded-xl p-4"
        style={{ maxWidth: 420 }}
      >
        <ModalHeader className="flex flex-row items-center justify-between">
          <ModalTitle className="text-board-heading text-sm font-semibold">
            {boardText(title)}
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
            if (!label.trim()) return;
            onSave({ label: label.trim(), accent });
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-board-secondary text-[11px] font-medium">
              {boardText("Название колонки")}
            </span>
            <input
              autoFocus
              className="border-board-input-border bg-board-canvas text-board-input-text focus:border-board-accent h-8 w-full rounded-md border px-2.5 text-xs outline-none"
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              required
              value={label}
            />
          </label>

          <div className="border-board-divider bg-board-canvas flex items-center justify-between gap-4 rounded-lg border px-2.5 py-2">
            <label className="flex min-w-0 items-center gap-2">
              <span className="text-board-secondary text-[11px] font-medium">
                {boardText("Цвет колонки")}
              </span>
              <input
                aria-label={boardText("Цвет колонки")}
                className="border-board-input-border bg-board-surface h-7 w-10 cursor-pointer rounded-md border p-1"
                onChange={(event) => setAccent(event.target.value)}
                type="color"
                value={accent}
              />
            </label>

            {column && (
              <div className="flex items-center gap-2">
                <span className="text-board-secondary text-[11px] font-medium">
                  {boardText("Порядок")}
                </span>
                <div className="flex gap-1">
                  <button
                    aria-label={boardText("Переместить колонку влево")}
                    className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover grid size-7 place-items-center rounded border disabled:opacity-40"
                    disabled={busy || columnIndex === 0}
                    onClick={() => onMove(-1)}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" className="size-3.5" />
                  </button>
                  <button
                    aria-label={boardText("Переместить колонку вправо")}
                    className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover grid size-7 place-items-center rounded border disabled:opacity-40"
                    disabled={busy || columnIndex === columnCount - 1}
                    onClick={() => onMove(1)}
                    type="button"
                  >
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {column && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium disabled:opacity-40"
                disabled={busy || exporting || taskCount === 0}
                onClick={onExport}
                type="button"
              >
                <Download aria-hidden="true" className="size-3.5" />
                {boardText(
                  exporting ? "Подготовка архива…" : "Скачать задачи колонки ({0})",
                  taskCount,
                )}
              </button>

              <button
                className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium disabled:opacity-40"
                disabled={busy}
                onClick={onAddDivider}
                type="button"
              >
                <SeparatorHorizontal aria-hidden="true" className="size-3.5" />
                {boardText("Добавить разделитель")}
              </button>

              <button
                className="text-board-rose hover:bg-board-rose-surface inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium disabled:opacity-40"
                title={
                  taskCount > 0
                    ? boardText("Переместите задачи перед удалением колонки")
                    : undefined
                }
                disabled={busy || taskCount > 0 || columnCount < 2}
                onClick={onDelete}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                {boardText("Удалить колонку")}
              </button>
            </div>
          )}

          <ModalFooter className="border-board-divider border-t pt-2.5">
            <ModalClose asChild>
              <button
                className="border-board-button-border bg-board-surface text-board-button-text hover:bg-board-button-hover h-7 rounded-md border px-2.5 text-[11px] font-medium"
                type="button"
              >
                {boardText("Отмена")}
              </button>
            </ModalClose>
            <button
              className="bg-board-accent text-board-on-accent hover:bg-board-accent-hover h-7 rounded-md px-2.5 text-[11px] font-medium disabled:opacity-50"
              disabled={busy || !label.trim()}
              type="submit"
            >
              {boardText(busy ? "Сохранение…" : "Сохранить")}
            </button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};
