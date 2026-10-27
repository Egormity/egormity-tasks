import { LoaderCircle, Palette, Plus, Save, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/features/board/components/modal";
import type { TaskTagTone } from "@/features/board/data/task-data";
import type { TrackerTag, TrackerTagUpdate } from "@/features/board/data/tracker-api";

import { boardText } from "@/features/board/i18n/board-copy";
import { TaskTagColorPicker } from "./task-tag-ui";

type TaskTagManagerModalProps = {
  readonly onCreateTag: (name: string, tone: TaskTagTone) => Promise<TrackerTag | undefined>;
  readonly onDeleteTag: (tag: TrackerTag) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdateTag: (
    id: string,
    input: TrackerTagUpdate,
  ) => Promise<TrackerTag | undefined>;
  readonly open: boolean;
  readonly tags: readonly TrackerTag[];
};

export const TaskTagManagerModal = ({
  onCreateTag,
  onDeleteTag,
  onOpenChange,
  onUpdateTag,
  open,
  tags,
}: TaskTagManagerModalProps) => {
  const [newTagName, setNewTagName] = useState("");
  const [newTagTone, setNewTagTone] = useState<TaskTagTone>("green");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [updatingTagId, setUpdatingTagId] = useState<string | null>(null);
  const [nameErrorTagId, setNameErrorTagId] = useState<string | null>(null);

  const createTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newTagName.trim();
    if (!name || isCreating) return;

    setIsCreating(true);
    try {
      const created = await onCreateTag(name, newTagTone);
      if (created) setNewTagName("");
    } finally {
      setIsCreating(false);
    }
  };

  const updateTone = async (tag: TrackerTag, tone: TaskTagTone) => {
    if (tag.tone === tone || updatingTagId) return;

    setUpdatingTagId(tag.id);
    try {
      await onUpdateTag(tag.id, { tone });
    } finally {
      setUpdatingTagId(null);
    }
  };

  const updateName = async (tag: TrackerTag) => {
    const name = (draftNames[tag.id] ?? tag.name).trim();
    if (!name) {
      setNameErrorTagId(tag.id);
      return;
    }
    if (name === tag.name || updatingTagId) return;

    setUpdatingTagId(tag.id);
    try {
      const updated = await onUpdateTag(tag.id, { name });
      if (updated) setDraftNames((current) => ({ ...current, [tag.id]: updated.name }));
    } finally {
      setUpdatingTagId(null);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDraftNames({});
      setNameErrorTagId(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <ModalContent
        className="border-board-modal-border flex !overflow-hidden max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl flex-col rounded-xl p-0"
        nested
      >
        <ModalHeader className="border-board-section-border shrink-0 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="bg-board-selected text-board-accent grid size-8 shrink-0 place-items-center rounded-lg">
                <Palette aria-hidden="true" className="size-4" />
              </span>
              <div>
                <ModalTitle className="text-board-heading text-base tracking-[-0.02em]">
                  {boardText("Настроить справочник тегов")}
                </ModalTitle>
                <ModalDescription className="text-board-muted mt-0.5 text-xs leading-4">
                  {boardText(
                    "Создавайте теги и изменяйте их название или цвет. Назначение тегов выполняется прямо в карточке.",
                  )}
                </ModalDescription>
              </div>
            </div>
            <ModalClose
              aria-label={boardText("Закрыть окно")}
              className="text-board-icon hover:bg-board-input-surface hover:text-board-accent-hover focus-visible:ring-board-accent grid size-7 shrink-0 place-items-center rounded-lg transition focus-visible:ring-2 focus-visible:outline-none"
            >
              <X aria-hidden="true" className="size-4" />
            </ModalClose>
          </div>
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-board-text text-xs font-semibold">{boardText("Все теги")}</h3>
              <p className="text-board-subtle mt-0.5 text-[11px]">
                {boardText("Настройка не меняет привязки карточки.")}
              </p>
            </div>
            <span className="bg-board-toolbar-hover text-board-accent-muted rounded-full px-2 py-0.5 text-[10px] font-medium">
              {tags.length}
              {boardText("всего")}
            </span>
          </div>

          {tags.length > 0 ? (
            <div className="space-y-1.5">
              {tags.map((tag) => {
                const draftName = draftNames[tag.id] ?? tag.name;
                const hasNameChanges = draftName.trim() !== tag.name;
                const isUpdating = updatingTagId === tag.id;

                return (
                  <div
                    className="border-board-modal-border bg-board-surface rounded-lg border p-2"
                    key={tag.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[8rem] flex-1">
                        <label className="sr-only" htmlFor={`managed-tag-name-${tag.id}`}>
                          {boardText("Название")}
                        </label>
                        <input
                          aria-invalid={nameErrorTagId === tag.id}
                          className="border-board-input-border bg-board-surface text-board-input-text placeholder:text-board-placeholder focus:border-board-accent focus:ring-board-accent/15 aria-[invalid=true]:border-board-rose h-8 w-full rounded-md border px-2.5 text-xs transition outline-none focus:ring-2"
                          id={`managed-tag-name-${tag.id}`}
                          onChange={(event) => {
                            setDraftNames((current) => ({
                              ...current,
                              [tag.id]: event.target.value,
                            }));
                            if (nameErrorTagId === tag.id) setNameErrorTagId(null);
                          }}
                          value={draftName}
                        />
                        {nameErrorTagId === tag.id && (
                          <p className="text-board-rose mt-1 text-xs">
                            {boardText("Введите название тега.")}
                          </p>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <div className="flex items-center gap-1">
                          <TaskTagColorPicker
                            compact
                            disabled={updatingTagId !== null}
                            label={boardText("Цвет тега {0}", tag.name)}
                            onChange={(tone) => void updateTone(tag, tone)}
                            value={tag.tone}
                          />
                          {isUpdating && (
                            <LoaderCircle
                              aria-label={boardText("Сохранение цвета тега")}
                              className="text-board-accent size-3.5 animate-spin"
                            />
                          )}
                        </div>
                        <button
                          aria-label={boardText("Сохранить тег {0}", tag.name)}
                          className="text-board-accent hover:bg-board-selected focus-visible:ring-board-accent grid size-7 shrink-0 place-items-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={!hasNameChanges || isUpdating || updatingTagId !== null}
                          onClick={() => void updateName(tag)}
                          type="button"
                        >
                          {isUpdating ? (
                            <LoaderCircle
                              aria-hidden="true"
                              className="size-3.5 animate-spin"
                            />
                          ) : (
                            <Save aria-hidden="true" className="size-3.5" />
                          )}
                        </button>
                        <button
                          aria-label={boardText("Удалить тег {0}", tag.name)}
                          className="text-board-rose hover:bg-board-rose-surface hover:text-board-danger focus-visible:ring-board-accent grid size-7 shrink-0 place-items-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
                          onClick={() => {
                            onOpenChange(false);
                            onDeleteTag(tag);
                          }}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-board-subtle mt-1 text-[10px]">
                      {boardText("Используется в")}
                      {tag.usageCount}{" "}
                      {tag.usageCount === 1 ? boardText("карточке") : boardText("карточках")}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border-board-input-border text-board-subtle rounded-lg border border-dashed px-3 py-5 text-center text-xs">
              {boardText("Тегов пока нет — создайте первый ниже.")}
            </div>
          )}

          <form
            className="border-board-modal-border bg-board-canvas mt-3 rounded-lg border p-3"
            onSubmit={(event) => void createTag(event)}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <Plus aria-hidden="true" className="text-board-accent size-3.5" />
              <h3 className="text-board-text text-xs font-semibold">
                {boardText("Новый тег")}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={boardText("Название нового тега")}
                className="border-board-input-border bg-board-surface text-board-input-text placeholder:text-board-placeholder focus:border-board-accent focus:ring-board-accent/15 h-8 min-w-[8rem] flex-1 rounded-md border px-2.5 text-xs transition outline-none focus:ring-2"
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder={boardText("Например, Важно")}
                value={newTagName}
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TaskTagColorPicker
                  compact
                  label={boardText("Цвет нового тега")}
                  onChange={setNewTagTone}
                  value={newTagTone}
                />
                <button
                  className="bg-board-accent text-board-on-accent hover:bg-board-accent-hover focus-visible:ring-board-accent shadow-board-button inline-flex h-8 items-center justify-center gap-1 rounded-md px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!newTagName.trim() || isCreating}
                  type="submit"
                >
                  {isCreating ? (
                    <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                  ) : (
                    <Plus aria-hidden="true" className="size-3.5" />
                  )}
                  {isCreating ? boardText("Создание…") : boardText("Создать тег")}
                </button>
              </div>
            </div>
          </form>
        </div>

        <ModalFooter className="border-board-section-border shrink-0 border-t px-4 py-3">
          <ModalClose asChild>
            <button
              className="bg-board-selected text-board-accent hover:bg-board-selected-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center rounded-md px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
              type="button"
            >
              {boardText("Готово")}
            </button>
          </ModalClose>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
