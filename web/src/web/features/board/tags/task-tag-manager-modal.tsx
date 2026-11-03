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
import type { TrackerTag } from "@/features/board/data/tracker-api";
import type { TagBatchUpdate } from "@contracts/board.js";

import { boardText } from "@/features/board/i18n/board-copy";
import { TaskTagColorPicker } from "./task-tag-ui";
import { TaskTagPreview } from "./task-tag-preview";

type TagDraft = {
  readonly name?: string | undefined;
  readonly tone?: TaskTagTone | undefined;
};

type TaskTagManagerModalProps = {
  readonly onCreateTag: (name: string, tone: TaskTagTone) => Promise<TrackerTag | undefined>;
  readonly onDeleteTag: (tag: TrackerTag) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdateTags: (tags: readonly TagBatchUpdate[]) => Promise<boolean>;
  readonly open: boolean;
  readonly tags: readonly TrackerTag[];
};

export const TaskTagManagerModal = ({
  onCreateTag,
  onDeleteTag,
  onOpenChange,
  onUpdateTags,
  open,
  tags,
}: TaskTagManagerModalProps) => {
  const [newTagName, setNewTagName] = useState("");
  const [newTagTone, setNewTagTone] = useState<TaskTagTone>("green");
  const [drafts, setDrafts] = useState<Readonly<Record<string, TagDraft>>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const draftFor = (tag: TrackerTag) => ({
    name: drafts[tag.id]?.name ?? tag.name,
    tone: drafts[tag.id]?.tone ?? tag.tone,
  });

  const isChanged = (tag: TrackerTag) => {
    const draft = draftFor(tag);
    return draft.name.trim() !== tag.name || draft.tone !== tag.tone;
  };

  const changedTags = tags.filter(isChanged);
  const hasEmptyName = changedTags.some((tag) => !draftFor(tag).name.trim());

  const updateDraft = (tag: TrackerTag, patch: TagDraft) => {
    setDrafts((current) => ({
      ...current,
      [tag.id]: { ...current[tag.id], ...patch },
    }));
  };

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

  const saveChanges = async () => {
    if (isSaving || changedTags.length === 0 || hasEmptyName) return;

    setIsSaving(true);
    try {
      const updates = changedTags.map((tag) => {
        const draft = draftFor(tag);
        const name = draft.name.trim();
        return {
          id: tag.id,
          ...(name !== tag.name ? { name } : {}),
          ...(draft.tone !== tag.tone ? { tone: draft.tone } : {}),
        };
      });
      if (await onUpdateTags(updates)) handleOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setDrafts({});
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
                const draft = draftFor(tag);
                const changed = isChanged(tag);
                const nameEmpty = !draft.name.trim();

                return (
                  <div
                    className={`bg-board-surface rounded-lg border p-2 ${changed ? "border-board-accent-border" : "border-board-modal-border"}`}
                    key={tag.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[8rem] flex-1">
                        <label className="sr-only" htmlFor={`managed-tag-name-${tag.id}`}>
                          {boardText("Название")}
                        </label>
                        <input
                          aria-invalid={nameEmpty}
                          className="border-board-input-border bg-board-surface text-board-input-text placeholder:text-board-placeholder focus:border-board-accent focus:ring-board-accent/15 aria-[invalid=true]:border-board-rose h-8 w-full rounded-md border px-2.5 text-xs transition outline-none focus:ring-2"
                          disabled={isSaving}
                          id={`managed-tag-name-${tag.id}`}
                          onChange={(event) => updateDraft(tag, { name: event.target.value })}
                          value={draft.name}
                        />
                        {nameEmpty && (
                          <p className="text-board-rose mt-1 text-xs">
                            {boardText("Введите название тега.")}
                          </p>
                        )}
                        <div className="mt-1.5">
                          <TaskTagPreview name={draft.name} tone={draft.tone} />
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <TaskTagColorPicker
                          compact
                          disabled={isSaving}
                          label={boardText("Цвет тега {0}", tag.name)}
                          onChange={(tone) => updateDraft(tag, { tone })}
                          value={draft.tone}
                        />
                        <button
                          aria-label={boardText("Удалить тег {0}", tag.name)}
                          className="text-board-rose hover:bg-board-rose-surface hover:text-board-danger focus-visible:ring-board-accent grid size-7 shrink-0 place-items-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
                          disabled={isSaving}
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
            <div className="mb-2">
              <TaskTagPreview name={newTagName} tone={newTagTone} />
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

        <ModalFooter className="border-board-section-border shrink-0 flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end">
          <ModalClose asChild>
            <button
              className="bg-board-selected text-board-accent hover:bg-board-selected-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center rounded-md px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
              type="button"
            >
              {boardText("Отмена")}
            </button>
          </ModalClose>
          <button
            className="bg-board-accent text-board-on-accent hover:bg-board-accent-hover focus-visible:ring-board-accent shadow-board-button inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            disabled={changedTags.length === 0 || hasEmptyName || isSaving}
            onClick={() => void saveChanges()}
            type="button"
          >
            {isSaving ? (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-3.5" />
            )}
            {boardText("Сохранить изменения")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
