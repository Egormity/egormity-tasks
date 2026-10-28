import { History } from "lucide-react";

import type {
  BoardColumn,
  TrackerEvent,
  TrackerEventChange,
} from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { formatBoardTimestamp } from "@/features/board/i18n/board-time";
import {
  formatTrackerEventChange,
  getTrackerEventFieldLabel,
  getTrackerStatusLabel,
} from "./task-editor-history-format";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEventChange = (value: unknown): value is TrackerEventChange => {
  if (!isRecord(value) || typeof value.field !== "string") return false;
  return [
    "attachments",
    "description",
    "order",
    "priority",
    "status",
    "tags",
    "title",
  ].includes(value.field);
};

const getEventChanges = (event: TrackerEvent): readonly TrackerEventChange[] => {
  if (Array.isArray(event.payload.changes)) {
    return event.payload.changes.filter(isEventChange);
  }

  const diff = event.payload.diff;
  return diff && Array.isArray(diff.changes) ? diff.changes.filter(isEventChange) : [];
};

const getEventLabel = (type: TrackerEvent["type"]) => {
  if (type === "created") return boardText("Задача создана");
  if (type === "comment_added") return boardText("Добавлен комментарий");
  if (type === "content_changed") return boardText("Изменения сохранены");
  if (type === "status_changed") return boardText("Статус изменён");
  if (type === "archived") return boardText("Задача архивирована");
  if (type === "restored") return boardText("Задача восстановлена");
  return boardText("Событие");
};

const getLegacyEventText = (event: TrackerEvent, columns: readonly BoardColumn[]) => {
  const from = event.payload.from;
  const to = event.payload.to;
  if (event.type === "status_changed" && typeof from === "string" && typeof to === "string") {
    return boardText(
      "Статус изменён с «{0}» на «{1}»",
      getTrackerStatusLabel(from, undefined, columns),
      getTrackerStatusLabel(to, undefined, columns),
    );
  }

  if (Array.isArray(event.payload.fields)) {
    const fields = event.payload.fields
      .filter((field): field is string => typeof field === "string")
      .map(getTrackerEventFieldLabel);
    return fields.length > 0 && boardText("Изменено: {0}", fields.join(", "));
  }

  return null;
};

type HistoryEntryProps = {
  readonly columns: readonly BoardColumn[];
  readonly event: TrackerEvent;
};

export const HistoryEntry = ({ columns, event }: HistoryEntryProps) => {
  const changes = getEventChanges(event);
  const legacyText = getLegacyEventText(event, columns);

  return (
    <article className="border-line bg-board-canvas/60 rounded-lg border px-3 py-2.5">
      <div className="flex gap-2.5">
        <span
          aria-hidden="true"
          className="bg-board-history-surface text-board-icon mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
        >
          <History className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <header className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-board-heading text-xs font-semibold">
              {getEventLabel(event.type)}
            </span>
            <time className="text-board-muted text-[0.72rem]" dateTime={event.createdAt}>
              {formatBoardTimestamp(event.createdAt)}
            </time>
          </header>
          {changes.length > 0 ? (
            <ul className="text-board-secondary text-xs leading-5">
              {changes.map((change, index) => (
                <li className="wrap-anywhere" key={`${event.id}-change-${index}`}>
                  {formatTrackerEventChange(change, columns)}
                </li>
              ))}
            </ul>
          ) : legacyText ? (
            <p className="text-board-secondary wrap-anywhere text-xs leading-5">{legacyText}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
};
