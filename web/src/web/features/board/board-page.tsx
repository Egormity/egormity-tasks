import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useState } from "react";
import { toast } from "sonner";

import { BoardColumn } from "@/features/board/components/board-column";
import { getOrderedColumnTasks } from "@/features/board/dnd/task-board-order";
import { TaskCard } from "@/features/board/components/task-card";
import type { Task, TaskStatus } from "@/features/board/data/task-data";
import { boardColumns } from "@/features/board/data/task-data";
import {
  type TaskExportItem,
  downloadTaskCollectionExportArchive,
} from "@/features/board/data/task-export";
import { getTrackerEvents } from "@/features/board/data/tracker-api";
import { useTrackerCards, useUpdateTrackerCard } from "@/features/board/data/tracker-hooks";
import { TrackerShell } from "@/features/board/components/tracker-shell";

import { boardText } from "@/features/board/i18n/board-copy";
import { useBoardDrag } from "@/features/board/dnd/use-board-drag";
import { useTaskEditor } from "@/features/board/editor/use-task-editor";

const getStringData = (value: unknown) => (typeof value === "string" ? value : undefined);

export const BoardPage = () => {
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [exportingColumnId, setExportingColumnId] = useState<TaskStatus | null>(null);
  const cardsQuery = useTrackerCards(archived ? "archived" : "active", search.trim());
  const allCardsQuery = useTrackerCards("active", "");
  const updateCard = useUpdateTrackerCard();
  const tasks = cardsQuery.data?.items ?? [];
  const { openCreate, openView, handleArchive, isExporting, isRestoring, dialogs } =
    useTaskEditor(exportingColumnId !== null);
  const {
    displayedTasks,
    dropTarget,
    handleBeforeDragStart,
    handleDragStart,
    handleCollision,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  } = useBoardDrag(tasks, allCardsQuery.data?.items, updateCard);

  const handleExportAll = async (
    columnId: TaskStatus,
    columnLabel: string,
    columnTasks: readonly Task[],
  ) => {
    if (isExporting || exportingColumnId || columnTasks.length === 0) return;

    setExportingColumnId(columnId);
    try {
      const exportedTasks: TaskExportItem[] = [];
      for (let index = 0; index < columnTasks.length; index += 5) {
        const batch = await Promise.all(
          columnTasks.slice(index, index + 5).map(async (task) => ({
            events: (await getTrackerEvents(task.id)).items,
            task,
          })),
        );
        exportedTasks.push(...batch);
      }
      const missingAttachmentCount = await downloadTaskCollectionExportArchive(
        columnLabel,
        exportedTasks,
      );
      if (missingAttachmentCount > 0) {
        toast.warning(
          boardText(
            "Архив скачан; {0} вложений недоступны и перечислены в отчёте внутри архива.",
            missingAttachmentCount,
          ),
        );
      } else {
        toast.success(boardText("Архив колонки «{0}» скачан", columnLabel));
      }
    } catch {
      toast.error(
        boardText(
          "Не удалось экспортировать колонку «{0}»: проверьте загрузку истории и вложений.",
          columnLabel,
        ),
      );
    } finally {
      setExportingColumnId(null);
    }
  };

  return (
    <TrackerShell
      archived={archived}
      onToggleArchive={() => setArchived((value) => !value)}
      headerSummary={
        <span className="text-board-summary whitespace-nowrap text-[14px] tabular-nums">
          {tasks.length} {boardText("задач в проекте")}
        </span>
      }
      onCreateTask={openCreate}
      onSearchChange={setSearch}
      searchValue={search}
      title={boardText(archived ? "Архив" : "Доска")}
    >
      {cardsQuery.isLoading && (
        <p className="text-board-summary py-6 text-center text-xs">
          {boardText("Загрузка задач…")}
        </p>
      )}
      {cardsQuery.isError && (
        <p className="text-board-rose py-6 text-center text-xs">
          {boardText("Не удалось загрузить задачи.")}
        </p>
      )}
      {archived && !cardsQuery.isLoading && !cardsQuery.isError && (
        <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              readOnly
              onOpen={openView}
              onRestore={handleArchive}
              isRestoring={isRestoring}
            />
          ))}
          {!tasks.length && (
            <p className="text-board-subtle py-6 text-xs">
              {boardText("Нет подходящих задач")}
            </p>
          )}
        </div>
      )}
      {!archived && !cardsQuery.isLoading && !cardsQuery.isError && (
        <DragDropProvider
          onBeforeDragStart={handleBeforeDragStart}
          onCollision={handleCollision}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
        >
          <DragOverlay className="pointer-events-none" dropAnimation={null}>
            {(source) => {
              const taskId = getStringData(source.data.taskId);
              const task = displayedTasks.find((item) => item.id === taskId);
              return task && <TaskCard isOverlay task={task} />;
            }}
          </DragOverlay>
          <div className="flex min-h-full min-w-[1320px] items-stretch">
            {boardColumns.map((column) => {
              const columnTasks = getOrderedColumnTasks(displayedTasks, column.id);
              const allColumnTasks = getOrderedColumnTasks(
                allCardsQuery.data?.items ?? [],
                column.id,
              );
              return (
                <div className="flex min-w-[220px] flex-1 flex-col" key={column.id}>
                  <BoardColumn
                    column={column}
                    insertionBeforeId={
                      dropTarget?.status === column.id ? dropTarget.beforeId : undefined
                    }
                    dragDisabled={!allCardsQuery.data || updateCard.isPending}
                    exportDisabled={
                      !allCardsQuery.data || isExporting || exportingColumnId !== null
                    }
                    exportTaskCount={allColumnTasks.length}
                    isExporting={exportingColumnId === column.id}
                    onExportAll={() =>
                      void handleExportAll(column.id, boardText(column.label), allColumnTasks)
                    }
                    onOpen={openView}
                    tasks={columnTasks}
                  />
                </div>
              );
            })}
          </div>
        </DragDropProvider>
      )}

      {dialogs}
    </TrackerShell>
  );
};
