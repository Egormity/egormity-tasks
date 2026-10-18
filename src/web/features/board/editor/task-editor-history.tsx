import { ChevronDown, History } from "lucide-react";
import { useState } from "react";

import type { TrackerEvent, TrackerEventChange } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import {
  formatTrackerEventChange,
  getTrackerEventFieldLabel,
  getTrackerStatusLabel,
} from "./task-editor-history-format";

type TaskEditorHistoryProps = {
  readonly events: readonly TrackerEvent[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEventChange = (value: unknown): value is TrackerEventChange => {
  if (!isRecord(value) || typeof value.field !== "string") return false;
  return [
    "agentVerdict",
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

const getLegacyEventText = (event: TrackerEvent) => {
  const from = event.payload.from;
  const to = event.payload.to;
  if (event.type === "status_changed" && typeof from === "string" && typeof to === "string") {
    return boardText(
      "Статус изменён с «{0}» на «{1}»",
      getTrackerStatusLabel(from),
      getTrackerStatusLabel(to),
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

export const TaskEditorHistory = ({ events }: TaskEditorHistoryProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section
      aria-labelledby="task-history-heading"
      className="border-board-section-border border-t pt-5"
    >
      <button
        aria-controls="task-history-content"
        aria-expanded={isOpen}
        className="group hover:bg-board-canvas focus-visible:ring-board-accent flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex items-center gap-2.5">
          <span className="bg-board-history-surface text-board-icon grid size-8 place-items-center rounded-lg">
            <History aria-hidden="true" className="size-4" />
          </span>
          <span>
            <span
              className="text-board-text block text-sm font-semibold"
              id="task-history-heading"
            >
              {boardText("История событий")}
            </span>
            <span className="text-board-subtle mt-0.5 block text-xs">
              {events.length > 0
                ? boardText("{0} событий", events.length)
                : boardText("Событий пока нет")}
            </span>
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`text-board-icon group-hover:text-board-accent-hover size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="border-board-attachment-border bg-board-canvas mt-3 space-y-2 overflow-y-auto rounded-xl border p-3"
          id="task-history-content"
        >
          {events.length > 0 ? (
            events.map((event) => {
              const changes = getEventChanges(event);
              const legacyText = getLegacyEventText(event);
              return (
                <div
                  className="bg-board-surface/70 space-y-1.5 rounded-lg p-2.5 text-xs"
                  key={event.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-board-event-text font-medium">
                      {getEventLabel(event.type)}
                    </span>
                    <time className="text-board-subtle shrink-0" dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString(document.documentElement.lang, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {changes.length > 0 ? (
                    <ul className="text-board-text space-y-1">
                      {changes.map((change, index) => (
                        <li className="leading-5" key={`${event.id}-change-${index}`}>
                          {formatTrackerEventChange(change)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    legacyText && <p className="text-board-text leading-5">{legacyText}</p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-board-subtle text-xs">{boardText("История пока пуста")}</p>
          )}
        </div>
      )}
    </section>
  );
};
