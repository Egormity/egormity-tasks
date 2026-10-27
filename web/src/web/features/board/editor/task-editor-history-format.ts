import type { TaskAttachment, TrackerEventChange } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";

const statusLabels: Record<string, string> = {
  archived: "Архив",
  backlog: "Бэк лог",
  clarification: "Нужно уточнение / дизайн",
  done: "Готово",
  inProgress: "Готово к публикации",
  queue: "Очередь",
  review: "Приёмка",
};

const fieldLabels: Record<string, string> = {
  attachments: "Вложения",
  description: "Описание",
  order: "Порядок",
  priority: "Приоритет",
  status: "Статус",
  tags: "Теги",
  title: "Название",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAttachment = (value: unknown): value is TaskAttachment =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string";

const formatValue = (value: number | string | null) =>
  value === null || value === "" ? boardText("«пусто»") : `«${String(value)}»`;

const formatAttachmentNames = (attachments: readonly TaskAttachment[]) =>
  attachments.length > 0
    ? attachments.map((attachment) => `«${attachment.name}»`).join(", ")
    : "";

const formatAttachmentChange = (
  change: Extract<TrackerEventChange, { field: "attachments" }>,
) => {
  const parts: string[] = [];
  const added = change.added?.filter(isAttachment) ?? [];
  const removed = change.removed?.filter(isAttachment) ?? [];
  const changed =
    change.changed?.filter(
      (item): item is { from: TaskAttachment; to: TaskAttachment } =>
        isRecord(item) && isAttachment(item.from) && isAttachment(item.to),
    ) ?? [];

  if (added.length > 0) parts.push(boardText("добавлены {0}", formatAttachmentNames(added)));
  if (removed.length > 0) parts.push(boardText("удалены {0}", formatAttachmentNames(removed)));
  if (changed.length > 0) {
    parts.push(
      boardText(
        "изменены {0}",
        changed
          .map(({ from, to }) =>
            from.name === to.name ? `«${to.name}»` : `«${from.name}» → «${to.name}»`,
          )
          .join(", "),
      ),
    );
  }

  return boardText("Вложения изменены: {0}", parts.join(", "));
};

export const getTrackerStatusLabel = (status: string, label?: string) =>
  boardText(statusLabels[status] ?? label ?? status);

export const getTrackerEventFieldLabel = (field: string) =>
  boardText(fieldLabels[field] ?? field);

export const formatTrackerEventChange = (change: TrackerEventChange): string => {
  if (change.field === "status") {
    return boardText(
      "Статус изменён с «{0}» на «{1}»",
      getTrackerStatusLabel(change.from, change.fromLabel),
      getTrackerStatusLabel(change.to, change.toLabel),
    );
  }
  if (change.field === "title") {
    return boardText(
      "Название изменено с {0} на {1}",
      formatValue(change.from),
      formatValue(change.to),
    );
  }
  if (change.field === "description") {
    return boardText(
      "Описание изменено с {0} на {1}",
      formatValue(change.from),
      formatValue(change.to),
    );
  }
  if (change.field === "attachments") return formatAttachmentChange(change);
  if (change.field === "tags") {
    const parts: string[] = [];
    if (change.added?.length)
      parts.push(boardText("добавлены {0}", change.added.map((id) => `«${id}»`).join(", ")));
    if (change.removed?.length)
      parts.push(boardText("удалены {0}", change.removed.map((id) => `«${id}»`).join(", ")));
    return boardText("Теги изменены: {0}", parts.join(", "));
  }

  return boardText(
    "{0} изменён с {1} на {2}",
    getTrackerEventFieldLabel(change.field),
    formatValue(change.from),
    formatValue(change.to),
  );
};
