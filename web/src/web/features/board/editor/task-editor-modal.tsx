import { Archive, Download, LoaderCircle, X } from "lucide-react";
import { type ClipboardEvent, type FormEvent, useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/features/board/components/modal";
import {
  createTaskAttachments,
  getClipboardFiles,
} from "@/features/board/attachments/task-attachment-utils";
import {
  boardColumns,
  type Task,
  type TaskAttachment,
  type TaskStatus,
  type TaskTagTone,
  type TrackerEvent,
} from "@/features/board/data/task-data";
import { TaskDescriptionEditor } from "./task-description-editor";
import {
  TaskAttachmentsCarousel,
  TaskEditorAttachments,
} from "@/features/board/attachments/task-editor-attachments";
import { TaskEditorHistory } from "./task-editor-history";
import { TaskEditorTags } from "@/features/board/tags/task-editor-tags";
import { TaskTagManagerModal } from "@/features/board/tags/task-tag-manager-modal";
import type { TrackerTag, TrackerTagUpdate } from "@/features/board/data/tracker-api";

import { boardText } from "@/features/board/i18n/board-copy";
import { TaskComments } from "../comments/TaskComments";

export type TaskEditorValues = {
  readonly attachmentFiles: ReadonlyMap<string, File>;
  readonly attachments: readonly TaskAttachment[];
  readonly description: string;
  readonly status: TaskStatus;
  readonly tagIds: readonly string[];
  readonly title: string;
};

type TaskEditorModalProps = {
  readonly mode: TaskEditorMode;
  readonly onArchive?: (() => void) | undefined;
  readonly isArchiving?: boolean | undefined;
  readonly isSaving?: boolean | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreateTag: (name: string, tone: TaskTagTone) => Promise<TrackerTag | undefined>;
  readonly onDeleteTag: (tag: TrackerTag) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly onSave: (values: TaskEditorValues) => void;
  readonly onExport?: (() => void) | undefined;
  readonly isExporting?: boolean | undefined;
  readonly onRequestEdit?: (() => void) | undefined;
  readonly onUpdateTag: (
    id: string,
    input: TrackerTagUpdate,
  ) => Promise<TrackerTag | undefined>;
  readonly open: boolean;
  readonly events: readonly TrackerEvent[];
  readonly tags: readonly TrackerTag[];
  readonly task?: (Task | null) | undefined;
};

export type TaskEditorMode = "create" | "edit" | "view";

export const TaskEditorModal = ({
  events,
  mode,
  onArchive,
  onCancel,
  onCreateTag,
  onDeleteTag,
  onExport,
  onOpenChange,
  onSave,
  onRequestEdit,
  onUpdateTag,
  open,
  isArchiving = false,
  isExporting = false,
  isSaving = false,
  tags,
  task,
}: TaskEditorModalProps) => {
  const isView = mode === "view";
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [attachments, setAttachments] = useState<readonly TaskAttachment[]>(
    task?.attachments ?? [],
  );
  const [attachmentFiles, setAttachmentFiles] = useState<ReadonlyMap<string, File>>(
    () => new Map(),
  );
  const [titleError, setTitleError] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<readonly string[]>(
    task?.tags?.map((tag) => tag.id) ?? [],
  );
  const [status, setStatus] = useState<TaskStatus>(
    task?.status && task.status !== "archived" ? task.status : "backlog",
  );
  const appliedTagIds = selectedTagIds.filter((id) => tags.some((tag) => tag.id === id));
  const handleAddFiles = useCallback((files: readonly File[]) => {
    const nextAttachments = createTaskAttachments(files);
    setAttachments((current) => [...current, ...nextAttachments]);
    setAttachmentFiles((current) => {
      const next = new Map(current);
      nextAttachments.forEach((attachment, index) => next.set(attachment.id, files[index]!));
      return next;
    });
  }, []);

  const {
    getInputProps,
    getRootProps,
    isDragActive,
    open: openFilePicker,
  } = useDropzone({
    disabled: isView,
    noClick: true,
    noKeyboard: true,
    onDrop: handleAddFiles,
  });

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachmentFiles((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = getClipboardFiles(event.clipboardData);
    if (files.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    handleAddFiles(files);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setTitleError(boardText("Введите название задачи"));
      return;
    }

    setTitleError("");
    onSave({
      attachmentFiles,
      attachments,
      description: description.trim().slice(0, 8000),
      status,
      tagIds: appliedTagIds,
      title: normalizedTitle,
    });
  };

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange}>
        <ModalContent
          {...getRootProps({ role: "dialog" })}
          className={`flex !max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] !max-w-6xl flex-col overflow-hidden rounded-md border p-0 transition-[border-color,box-shadow] ${
            isDragActive
              ? "border-board-accent ring-board-accent/20 ring-4"
              : "border-board-modal-border"
          }`}
          onPasteCapture={isView ? undefined : handlePaste}
          style={{ overflow: "hidden" }}
        >
          <input {...getInputProps()} />
          {isDragActive && (
            <div className="border-board-accent bg-board-surface/85 text-board-accent-hover pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-md border-2 border-dashed text-center text-xs font-medium">
              {boardText("Отпустите файлы, чтобы добавить их к задаче")}
            </div>
          )}
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <ModalHeader className="border-board-section-border shrink-0 border-b px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <ModalTitle className="text-board-heading text-base tracking-tight">
                    {mode === "create"
                      ? boardText("Новая задача")
                      : mode === "edit"
                        ? boardText("Редактировать задачу")
                        : boardText("Просмотр задачи")}
                  </ModalTitle>
                  <ModalDescription className="text-board-muted mt-1 max-w-xl text-xs leading-4">
                    {mode === "view"
                      ? boardText("Просмотрите детали задачи и выберите нужное действие.")
                      : task
                        ? boardText("Обновите основные детали карточки и сохраните изменения.")
                        : boardText(
                            "Добавьте детали, чтобы команде было проще двигаться дальше.",
                          )}
                  </ModalDescription>
                </div>
                <ModalClose
                  aria-label={boardText("Закрыть окно")}
                  className="text-board-icon hover:bg-board-input-surface hover:text-board-accent-hover focus-visible:ring-board-accent grid size-7 shrink-0 place-items-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
                >
                  <X aria-hidden="true" className="size-4" />
                </ModalClose>
              </div>
            </ModalHeader>

            <div className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid min-h-full w-full min-w-0 gap-4 px-4 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)] lg:gap-x-0">
                {isView ? (
                  <>
                    <section
                      aria-label={boardText("Основные детали")}
                      className="task-editor-modal-divider lg:border-board-divider min-w-0 space-y-4 lg:border-r lg:pr-4"
                    >
                      <div>
                        <p className="text-board-muted text-xs font-medium">
                          {boardText("Название")}
                        </p>
                        <h2 className="text-board-heading mt-1 text-lg font-semibold tracking-tight">
                          {task?.title}
                        </h2>
                      </div>
                      <div>
                        <h2 className="text-board-text text-xs font-medium">
                          {boardText("Описание")}
                        </h2>
                        <div className="border-board-input-border bg-board-canvas text-board-secondary mt-1.5 min-h-20 rounded-md border px-3 py-2 text-xs leading-5">
                          {task?.description ? (
                            <p className="whitespace-pre-wrap">{task.description}</p>
                          ) : (
                            <p className="text-board-subtle">
                              {boardText("Описание не добавлено.")}
                            </p>
                          )}
                        </div>
                      </div>
                      {task && task.attachments.length > 0 && (
                        <section aria-labelledby="task-view-attachments-heading">
                          <h2
                            className="text-board-text text-xs font-medium"
                            id="task-view-attachments-heading"
                          >
                            {boardText("Вложения")}
                          </h2>
                          <TaskAttachmentsCarousel
                            attachments={task.attachments}
                            cardId={task.id}
                          />
                        </section>
                      )}
                      {task && <TaskComments key={task.id} cardId={task.id} />}
                    </section>

                    <aside className="min-w-0 space-y-4 lg:pl-4">
                      <TaskEditorTags
                        onConfigure={() => setTagManagerOpen(true)}
                        readOnly
                        selectedTagIds={appliedTagIds}
                        tags={tags}
                      />
                      {task && <TaskEditorHistory events={events} />}
                    </aside>
                  </>
                ) : (
                  <>
                    <section
                      aria-label={boardText("Основные детали")}
                      className="task-editor-modal-divider lg:border-board-divider min-w-0 space-y-3 lg:border-r lg:pr-4"
                    >
                      <div>
                        <label
                          className="text-board-text text-xs font-medium"
                          htmlFor="task-title"
                        >
                          {boardText("Название")}
                          <span className="text-board-rose">*</span>
                        </label>
                        <input
                          autoFocus
                          className="border-board-input-border bg-board-input-surface text-board-input-text placeholder:text-board-placeholder focus:border-board-accent focus:ring-board-accent/15 mt-1.5 h-8 w-full rounded-md border px-2.5 text-xs transition outline-none focus:ring-2"
                          id="task-title"
                          onChange={(event) => {
                            setTitle(event.target.value);
                            if (titleError) setTitleError("");
                          }}
                          placeholder={boardText("Например, подготовить макет главного экрана")}
                          value={title}
                        />
                        {titleError && (
                          <p className="text-board-rose mt-1.5 text-xs">{titleError}</p>
                        )}
                      </div>

                      {mode === "create" && (
                        <div>
                          <label
                            className="text-board-text text-xs font-medium"
                            htmlFor="task-status"
                          >
                            {boardText("Колонка")}
                          </label>
                          <select
                            className="border-board-input-border bg-board-input-surface text-board-input-text focus:border-board-accent focus:ring-board-accent/15 mt-1.5 h-8 w-full rounded-md border px-2.5 text-xs transition outline-none focus:ring-2"
                            id="task-status"
                            onChange={(event) => setStatus(event.target.value as TaskStatus)}
                            value={status}
                          >
                            {boardColumns.map((column) => (
                              <option key={column.id} value={column.id}>
                                {boardText(column.label)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <TaskEditorAttachments
                        attachments={attachments}
                        cardId={task?.id}
                        files={attachmentFiles}
                        onChooseFiles={openFilePicker}
                        onRemove={handleRemoveAttachment}
                      />

                      <div>
                        <div className="flex items-baseline justify-between gap-3">
                          <label
                            className="text-board-text text-xs font-medium"
                            htmlFor="task-description-editor"
                          >
                            {boardText("Описание")}{" "}
                            <span className="text-board-placeholder font-normal">
                              {boardText("(необязательно)")}
                            </span>
                          </label>
                          <span className="text-board-subtle shrink-0 text-xs tabular-nums">
                            {Math.min(description.length, 8000)}/8000
                          </span>
                        </div>
                        <TaskDescriptionEditor
                          initialValue={description}
                          maxLength={8000}
                          onChange={setDescription}
                        />
                        <p className="text-board-subtle mt-1.5 text-xs">
                          {boardText(
                            "Коротко опишите контекст, ожидаемый результат и важные ограничения.",
                          )}
                        </p>
                      </div>
                    </section>

                    <aside className="min-w-0 space-y-4 lg:pl-4">
                      <TaskEditorTags
                        onConfigure={() => setTagManagerOpen(true)}
                        onToggleTag={(id) =>
                          setSelectedTagIds((current) =>
                            current.includes(id)
                              ? current.filter((tagId) => tagId !== id)
                              : [...current, id],
                          )
                        }
                        selectedTagIds={appliedTagIds}
                        tags={tags}
                      />

                      {task && <TaskEditorHistory events={events} />}
                    </aside>
                  </>
                )}
              </div>
            </div>

            <ModalFooter className="border-board-section-border bg-board-surface shrink-0 border-t px-4 py-2.5">
              {isView ? (
                <>
                  <ModalClose asChild>
                    <button
                      className="border-board-input-border text-board-button-muted hover:bg-board-surface-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center rounded-md border px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
                      type="button"
                    >
                      {boardText("Закрыть")}
                    </button>
                  </ModalClose>
                  {onArchive && (
                    <button
                      aria-busy={isArchiving}
                      className="border-board-danger-border text-board-danger hover:bg-board-rose-surface focus-visible:ring-board-rose inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      disabled={isArchiving}
                      onClick={onArchive}
                      type="button"
                    >
                      {isArchiving ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <Archive aria-hidden="true" className="size-4" />
                      )}
                      {task?.archivedAt
                        ? boardText(isArchiving ? "Восстановление…" : "Восстановить")
                        : boardText(isArchiving ? "Архивирование…" : "Архивировать")}
                    </button>
                  )}
                  {onExport && (
                    <button
                      aria-busy={isExporting}
                      className="border-board-input-border text-board-accent hover:bg-board-subtle-selected focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      disabled={isExporting}
                      onClick={onExport}
                      type="button"
                    >
                      {isExporting ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <Download aria-hidden="true" className="size-4" />
                      )}
                      {isExporting
                        ? boardText("Подготовка архива…")
                        : boardText("Экспортировать")}
                    </button>
                  )}
                  {onRequestEdit && (
                    <button
                      className="bg-board-accent text-board-on-accent shadow-board-button hover:bg-board-accent-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
                      onClick={onRequestEdit}
                      type="button"
                    >
                      {boardText("Редактировать")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {onCancel ? (
                    <button
                      className="border-board-input-border text-board-button-muted hover:bg-board-surface-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center rounded-md border px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
                      onClick={onCancel}
                      type="button"
                    >
                      {boardText("Отмена")}
                    </button>
                  ) : (
                    <ModalClose asChild>
                      <button
                        className="border-board-input-border text-board-button-muted hover:bg-board-surface-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center rounded-md border px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
                        type="button"
                      >
                        {boardText("Отмена")}
                      </button>
                    </ModalClose>
                  )}
                  <button
                    aria-busy={isSaving}
                    className="bg-board-accent text-board-on-accent shadow-board-button hover:bg-board-accent-hover focus-visible:ring-board-accent inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    disabled={isSaving}
                    type="submit"
                  >
                    {isSaving && (
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    )}
                    {isSaving
                      ? task
                        ? boardText("Сохранение…")
                        : boardText("Создание…")
                      : task
                        ? boardText("Сохранить изменения")
                        : boardText("Создать задачу")}
                  </button>
                </>
              )}
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <TaskTagManagerModal
        onCreateTag={onCreateTag}
        onDeleteTag={onDeleteTag}
        onOpenChange={setTagManagerOpen}
        onUpdateTag={onUpdateTag}
        open={tagManagerOpen}
        tags={tags}
      />
    </>
  );
};
