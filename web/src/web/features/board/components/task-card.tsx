import { useDraggable } from "@dnd-kit/react";
import { CheckCircle2, GripVertical, LoaderCircle, Paperclip } from "lucide-react";
import type { KeyboardEvent, MouseEvent, RefCallback } from "react";

import type { Task } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { taskTagToneStyles } from "@/features/board/tags/task-tag-styles";
import { TaskAgentRail } from "@/features/board/discussion/task-agent-rail";

type TaskCardProps = {
  readonly dragDisabled?: boolean | undefined;
  readonly onOpen?: ((task: Task) => void) | undefined;
  readonly onRestore?: ((task: Task) => void) | undefined;
  readonly isRestoring?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly task: Task;
};

type TaskCardPresentationProps = TaskCardProps & {
  readonly cardRef?: RefCallback<HTMLElement> | undefined;
  readonly dragHandleRef?: RefCallback<HTMLButtonElement> | undefined;
  readonly isDragging?: boolean | undefined;
  readonly isOverlay?: boolean | undefined;
  readonly taskCardId?: string | undefined;
};

export const TaskCard = ({
  cardRef,
  dragHandleRef,
  dragDisabled = false,
  isDragging = false,
  isOverlay = false,
  onOpen,
  onRestore,
  isRestoring = false,
  readOnly = false,
  taskCardId,
  task,
}: TaskCardPresentationProps) => {
  const isDone = task.status === "done";
  const tags =
    task.tags.length > 0
      ? task.tags
      : task.tag
        ? [
            {
              id: `legacy-${task.id}`,
              name: task.tag,
              tone: task.tagTone ?? "green",
            },
          ]
        : [];
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!onOpen || (event.target as HTMLElement).closest("button, a")) return;
    onOpen(task);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onOpen || event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen(task);
  };

  return (
    <article
      className={`group bg-board-surface hover:border-board-card-border-hover hover:shadow-board-card relative min-h-24 rounded-xl border p-3.5 pl-14 transition ${
        isDragging
          ? "border-board-drag bg-board-drag/14 shadow-board-drag ring-board-drag/15 opacity-40 ring-2"
          : "border-board-card-border"
      } ${isDone && !isDragging ? "opacity-75" : ""} ${onOpen ? "cursor-pointer" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-task-card-id={taskCardId}
      ref={cardRef}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
    >
      <TaskAgentRail task={task} overlay={isOverlay} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2">
          {isDone && (
            <CheckCircle2
              aria-hidden="true"
              className="text-board-done-icon mt-0.5 size-4 shrink-0"
              strokeWidth={1.8}
            />
          )}
          <h3 className="text-board-text min-w-0 flex-1 text-[13px] leading-[1.45] font-medium">
            {task.title}
          </h3>
          {!readOnly && (dragHandleRef || isOverlay) && (
            <button
              aria-label={boardText("Переместить задачу: {0}", task.title)}
              className="text-board-icon hover:bg-board-selected hover:text-board-accent-hover focus-visible:ring-board-accent disabled:hover:text-board-icon grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              disabled={dragDisabled}
              tabIndex={isOverlay ? -1 : undefined}
              ref={dragHandleRef}
              type="button"
            >
              <GripVertical aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>

        {task.description && (
          <p className="text-board-muted mt-2 line-clamp-2 min-w-0 text-xs leading-4">
            {task.description}
          </p>
        )}

        {(tags.length > 0 || task.attachments.length > 0) && (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            {tags.length > 0 && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                  <span
                    className={`max-w-[11rem] shrink-0 truncate rounded-lg px-2.5 py-1.5 text-[10px] leading-none font-semibold ${taskTagToneStyles[tag.tone]}`}
                    key={tag.id}
                    title={tag.name}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
            {task.attachments.length > 0 && (
              <span
                aria-label={boardText("{0} вложений", task.attachments.length)}
                className="text-board-icon ml-auto inline-flex shrink-0 items-center gap-1 py-1.5 text-[10px] leading-none font-semibold"
                title={boardText("{0} вложений", task.attachments.length)}
              >
                <Paperclip aria-hidden="true" className="size-3" />
                {task.attachments.length}
              </span>
            )}
          </div>
        )}
      </div>

      {readOnly && (
        <div className="mt-3 flex justify-end">
          <button
            aria-busy={isRestoring}
            className="bg-board-selected text-board-accent hover:bg-board-selected-hover focus-visible:ring-board-accent inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRestoring}
            onClick={() => onRestore?.(task)}
            type="button"
          >
            {isRestoring && (
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            )}
            {isRestoring ? boardText("Восстановление…") : boardText("Восстановить")}
          </button>
        </div>
      )}
    </article>
  );
};

export const DraggableTaskCard = ({ dragDisabled = false, onOpen, task }: TaskCardProps) => {
  const { handleRef, isDragging, ref } = useDraggable({
    data: { taskId: task.id },
    disabled: dragDisabled,
    id: task.id,
    type: "task",
  });

  return (
    <TaskCard
      cardRef={ref}
      dragHandleRef={handleRef}
      dragDisabled={dragDisabled}
      isDragging={isDragging}
      onOpen={onOpen}
      taskCardId={task.id}
      task={task}
    />
  );
};
