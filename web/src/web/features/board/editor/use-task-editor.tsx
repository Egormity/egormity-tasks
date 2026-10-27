import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trackerBoardQuery } from "../data/tracker-query";
import { toTrackerTask } from "../data/tracker-api";
import { toast } from "sonner";
import { ConfirmModal } from "@/features/board/components/confirm-modal";
import { boardColumns, type Task } from "@/features/board/data/task-data";
import { TaskEditorModal, type TaskEditorValues } from "./task-editor-modal";
import { downloadTaskExportArchive } from "@/features/board/data/task-export";
import type { TrackerTag, TrackerTagUpdate } from "@/features/board/data/tracker-api";
import {
  useArchiveTrackerCard,
  useCreateTrackerCard,
  useCreateTrackerTag,
  useDeleteTrackerTag,
  useRestoreTrackerCard,
  useTrackerEvents,
  useTrackerTags,
  useUpdateTrackerCard,
  useUpdateTrackerTag,
  useUploadTrackerCardAttachment,
} from "@/features/board/data/tracker-hooks";
import { boardText } from "@/features/board/i18n/board-copy";

type EditorState = {
  readonly mode: "create" | "edit" | "view";
  readonly task?: Task | undefined;
};

export const useTaskEditor = (exportBlocked = false) => {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pendingTag, setPendingTag] = useState<TrackerTag | null>(null);
  const tagsQuery = useTrackerTags();
  const eventsQuery = useTrackerEvents(editor?.task?.id);
  const createCard = useCreateTrackerCard();
  const updateCard = useUpdateTrackerCard();
  const uploadAttachment = useUploadTrackerCardAttachment();
  const archiveCard = useArchiveTrackerCard();
  const restoreCard = useRestoreTrackerCard();
  const createTag = useCreateTrackerTag();
  const deleteTag = useDeleteTrackerTag();
  const updateTag = useUpdateTrackerTag();
  const tags = tagsQuery.data?.items ?? [];
  const liveTask =
    useQuery({
      ...trackerBoardQuery,
      enabled: editor?.mode === "view",
      select: (board) => {
        const task = board.cards.find((card) => card.id === editor?.task?.id);
        return task ? toTrackerTask(task, board.tags) : undefined;
      },
    }).data ?? editor?.task;
  const viewedTask = editor?.mode === "view" ? liveTask : editor?.task;

  const openCreate = () => setEditor({ mode: "create" });
  const openEdit = (task: Task) => setEditor({ mode: "edit", task });
  const openView = (task: Task) => setEditor({ mode: "view", task });

  const handleArchive = (task: Task) => {
    const mutation = task.archivedAt ? restoreCard : archiveCard;
    if (mutation.isPending) return;

    mutation.mutate(task, {
      onError: () =>
        toast.error(
          boardText(
            task.archivedAt
              ? "Не удалось восстановить задачу"
              : "Не удалось архивировать задачу",
          ),
        ),
      onSuccess: () => {
        toast.success(
          boardText(task.archivedAt ? "Задача восстановлена" : "Задача архивирована"),
        );
        setEditor(null);
      },
    });
  };

  const handleExport = async (task: Task) => {
    if (isExporting || exportBlocked) return;

    setIsExporting(true);
    try {
      const eventsResult = await eventsQuery.refetch();
      if (eventsResult.isError || !eventsResult.data) {
        throw new Error(boardText("Не удалось загрузить историю задачи."));
      }
      await downloadTaskExportArchive(task, eventsResult.data.items);
      toast.success(boardText("Архив задачи скачан"));
    } catch {
      toast.error(
        boardText("Не удалось экспортировать задачу: проверьте загрузку истории и вложений."),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleSave = async (values: TaskEditorValues) => {
    if (!editor || editor.mode === "view" || isSaving) return;

    setIsSaving(true);
    try {
      const pendingUploads = values.attachments.filter(
        (attachment) => values.attachmentFiles.has(attachment.id) && !attachment.objectId,
      );

      const uploadAttachments = async (cardId: string) => {
        for (const attachment of pendingUploads) {
          const file = values.attachmentFiles.get(attachment.id);
          if (!file) continue;
          await uploadAttachment.mutateAsync({
            attachmentId: attachment.id,
            cardId,
            file,
          });
        }
      };

      if (editor.mode === "edit" && editor.task) {
        try {
          await updateCard.mutateAsync({
            id: editor.task.id,
            input: {
              revision: editor.task.revision,
              attachments: values.attachments,
              description: values.description,
              tagIds: values.tagIds,
              title: values.title,
            },
          });
        } catch {
          toast.error(boardText("Не удалось сохранить изменения"));
          return;
        }
        try {
          await uploadAttachments(editor.task.id);
          toast.success(boardText("Задача обновлена"));
          setEditor(null);
        } catch {
          toast.error(boardText("Задача сохранена, но не удалось сохранить вложение"));
        }
        return;
      }

      let created: Task;
      try {
        created = await createCard.mutateAsync({
          attachments: values.attachments,
          description: values.description,
          priority: "medium",
          status: values.status,
          tagIds: values.tagIds,
          title: values.title,
        });
      } catch {
        toast.error(boardText("Не удалось создать задачу"));
        return;
      }
      try {
        await uploadAttachments(created.id);
        const column = boardColumns.find(({ id }) => id === values.status);
        toast.success(
          boardText("Задача добавлена в «{0}»", boardText(column?.label ?? "Бэк лог")),
        );
        setEditor(null);
      } catch {
        toast.error(boardText("Задача создана, но не удалось сохранить вложение"));
        setEditor(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateTag = async (
    name: string,
    tone: "violet" | "green" | "amber" | "blue" | "rose",
  ) => {
    try {
      const created = await createTag.mutateAsync({ name, tone });
      toast.success(boardText("Тег «{0}» создан", created.name));
      return created;
    } catch {
      toast.error(boardText("Не удалось создать тег"));
      return undefined;
    }
  };

  const handleUpdateTag = async (id: string, input: TrackerTagUpdate) => {
    try {
      const updated = await updateTag.mutateAsync({ id, input });
      toast.success(
        input.name !== undefined
          ? boardText("Тег «{0}» изменён", updated.name)
          : boardText("Цвет тега «{0}» изменён", updated.name),
      );
      return updated;
    } catch {
      toast.error(boardText("Не удалось изменить цвет тега"));
      return undefined;
    }
  };

  const handleDeleteTag = () => {
    if (!pendingTag || deleteTag.isPending) return;
    const tag = pendingTag;
    deleteTag.mutate(tag.id, {
      onError: () => toast.error(boardText("Не удалось удалить тег")),
      onSuccess: () => {
        toast.success(boardText("Тег «{0}» удалён", tag.name));
        setPendingTag(null);
      },
    });
  };

  return {
    openCreate,
    openView,
    handleArchive,
    isExporting,
    isRestoring: restoreCard.isPending,
    dialogs: (
      <>
        {editor && (
          <TaskEditorModal
            events={eventsQuery.data?.items ?? []}
            key={`${editor.mode}-${editor.task?.id ?? "new"}`}
            mode={editor.mode}
            onArchive={viewedTask ? () => handleArchive(viewedTask) : undefined}
            isArchiving={archiveCard.isPending || restoreCard.isPending}
            isExporting={isExporting}
            isSaving={isSaving}
            onCancel={
              editor.mode === "edit" && editor.task ? () => openView(editor.task!) : undefined
            }
            onCreateTag={handleCreateTag}
            onDeleteTag={setPendingTag}
            onExport={
              editor.mode === "view" && viewedTask
                ? () => void handleExport(viewedTask)
                : undefined
            }
            onOpenChange={(open) => {
              if (!open) setEditor(null);
            }}
            onRequestEdit={viewedTask ? () => openEdit(viewedTask) : undefined}
            onSave={(values) => void handleSave(values)}
            onUpdateTag={handleUpdateTag}
            open
            tags={tags}
            task={viewedTask}
          />
        )}
        <ConfirmModal
          description={boardText(
            "Тег «{0}» используют {1} карточек. После удаления он будет отвязан от них, а карточки сохранятся.",
            pendingTag?.name ?? "",
            tags.find((tag) => tag.id === pendingTag?.id)?.usageCount ?? 0,
          )}
          onConfirm={handleDeleteTag}
          isPending={deleteTag.isPending}
          onOpenChange={(open) => {
            if (!open) setPendingTag(null);
          }}
          open={Boolean(pendingTag)}
          title={boardText("Удалить тег?")}
        />
      </>
    ),
  };
};
