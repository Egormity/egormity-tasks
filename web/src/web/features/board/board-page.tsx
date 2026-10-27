import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useQuery } from "@tanstack/react-query";
import { Minus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BoardColumn } from "@/features/board/components/board-column";
import { BoardColumnSettingsModal } from "@/features/board/components/board-column-settings-modal";
import { getOrderedColumnTasks } from "@/features/board/dnd/task-board-order";
import { TaskCard } from "@/features/board/components/task-card";
import type {
  BoardColumn as BoardColumnType,
  Task,
  TaskStatus,
} from "@/features/board/data/task-data";
import { boardColumns } from "@/features/board/data/task-data";
import {
  type TaskExportItem,
  downloadTaskCollectionExportArchive,
} from "@/features/board/data/task-export";
import { getTrackerEvents } from "@/features/board/data/tracker-api";
import {
  useBoardConfiguration,
  useTrackerCards,
  useUpdateTrackerCard,
} from "@/features/board/data/tracker-hooks";
import { TrackerShell } from "@/features/board/components/tracker-shell";
import { trackerBoardQuery } from "@/features/board/data/tracker-query";

import { boardText } from "@/features/board/i18n/board-copy";
import { useBoardDrag } from "@/features/board/dnd/use-board-drag";
import { useTaskEditor } from "@/features/board/editor/use-task-editor";

const getStringData = (value: unknown) => (typeof value === "string" ? value : undefined);

export const BoardPage = ({ archived }: { archived: boolean }) => {
  const [search, setSearch] = useState("");
  const [exportingColumnId, setExportingColumnId] = useState<TaskStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<BoardColumnType | null>(null);
  const boardQuery = useQuery(trackerBoardQuery);
  const cardsQuery = useTrackerCards(archived ? "archived" : "active", search.trim());
  const allCardsQuery = useTrackerCards("active", "");
  const updateCard = useUpdateTrackerCard();
  const configureBoard = useBoardConfiguration();
  const columns = boardQuery.data?.columns ?? boardColumns;
  const dividers = boardQuery.data?.dividers ?? [];
  const taskCards = boardQuery.data?.cards ?? [];
  const tasks = cardsQuery.data?.items ?? [];
  const { openCreate, openView, handleArchive, isExporting, isRestoring, dialogs } =
    useTaskEditor(exportingColumnId !== null, columns);
  const {
    displayedTasks,
    dropTarget,
    handleBeforeDragStart,
    handleDragStart,
    handleCollision,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  } = useBoardDrag(tasks, allCardsQuery.data?.items, updateCard, columns);

  const closeSettings = () => {
    setSettingsOpen(false);
    setEditingColumn(null);
  };

  const handleSaveColumn = (input: { label: string; accent: string }) => {
    const action = editingColumn
      ? { type: "update-column" as const, id: editingColumn.id, input }
      : { type: "create-column" as const, input };
    configureBoard.mutate(action, {
      onError: () => toast.error(boardText("Не удалось сохранить колонку")),
      onSuccess: () => {
        closeSettings();
        toast.success(boardText(editingColumn ? "Колонка обновлена" : "Колонка добавлена"));
      },
    });
  };

  const handleMoveColumn = (offset: -1 | 1) => {
    if (!editingColumn) return;
    const from = columns.findIndex(({ id }) => id === editingColumn.id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= columns.length) return;
    const ordered = [...columns];
    [ordered[from], ordered[to]] = [ordered[to]!, ordered[from]!];
    configureBoard.mutate(
      { type: "reorder-columns", ids: ordered.map(({ id }) => id) },
      { onError: () => toast.error(boardText("Не удалось изменить порядок колонок")) },
    );
  };

  const handleDeleteColumn = () => {
    if (!editingColumn) return;
    configureBoard.mutate(
      { type: "delete-column", id: editingColumn.id },
      {
        onError: () => toast.error(boardText("Переместите задачи перед удалением колонки")),
        onSuccess: () => {
          closeSettings();
          toast.success(boardText("Колонка удалена"));
        },
      },
    );
  };

  const handleAddDivider = () =>
    configureBoard.mutate(
      { type: "add-divider" },
      { onError: () => toast.error(boardText("Не удалось добавить разделитель")) },
    );

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
      onCreateTask={archived ? undefined : openCreate}
      onAddColumn={
        archived
          ? undefined
          : () => {
              setEditingColumn(null);
              setSettingsOpen(true);
            }
      }
      onAddDivider={archived ? undefined : handleAddDivider}
      onSearchChange={setSearch}
      searchValue={search}
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
        <div
          className="mx-auto w-max min-w-full"
          style={{ minWidth: Math.max(1320, columns.length * 220) }}
        >
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
            <div className="flex min-h-full items-stretch justify-center">
              {columns.map((column) => {
                const columnTasks = getOrderedColumnTasks(displayedTasks, column.id);
                return (
                  <div className="flex min-w-[220px] flex-1 flex-col" key={column.id}>
                    <BoardColumn
                      column={column}
                      onConfigure={() => {
                        setEditingColumn(column);
                        setSettingsOpen(true);
                      }}
                      insertionBeforeId={
                        dropTarget?.status === column.id ? dropTarget.beforeId : undefined
                      }
                      dragDisabled={!allCardsQuery.data || updateCard.isPending}
                      onOpen={openView}
                      tasks={columnTasks}
                    />
                  </div>
                );
              })}
            </div>
          </DragDropProvider>
          {dividers.map((divider) => (
            <div className="relative flex h-8 items-center px-4" key={divider.id}>
              <span aria-hidden="true" className="bg-board-divider h-px w-full" />
              <button
                aria-label={boardText("Удалить разделитель")}
                className="bg-board-surface text-board-icon hover:bg-board-selected absolute left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full"
                disabled={configureBoard.isPending}
                onClick={() =>
                  configureBoard.mutate(
                    { type: "delete-divider", id: divider.id },
                    { onError: () => toast.error(boardText("Не удалось удалить разделитель")) },
                  )
                }
                type="button"
              >
                <Minus aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <BoardColumnSettingsModal
        open={settingsOpen}
        column={editingColumn}
        columnIndex={editingColumn ? columns.findIndex(({ id }) => id === editingColumn.id) : 0}
        columnCount={columns.length}
        taskCount={
          editingColumn
            ? taskCards.filter((card) => card.status === editingColumn.id).length
            : 0
        }
        busy={configureBoard.isPending}
        exporting={exportingColumnId === editingColumn?.id}
        onOpenChange={(open) => (open ? setSettingsOpen(true) : closeSettings())}
        onSave={handleSaveColumn}
        onMove={handleMoveColumn}
        onDelete={handleDeleteColumn}
        onExport={() => {
          if (!editingColumn) return;
          const columnTasks = getOrderedColumnTasks(
            allCardsQuery.data?.items ?? [],
            editingColumn.id,
          );
          void handleExportAll(editingColumn.id, boardText(editingColumn.label), columnTasks);
        }}
      />
      {dialogs}
    </TrackerShell>
  );
};
