import type { TrackerTag } from "@/features/board/data/tracker-api";

import { boardText } from "@/features/board/i18n/board-copy";
import { customTaskTagToneStyle, taskTagToneStyles } from "./task-tag-styles";

type TaskTagChipsProps = {
  readonly className?: string | undefined;
  readonly tags: readonly TrackerTag[];
};

export const TaskTagChips = ({ className = "", tags }: TaskTagChipsProps) => {
  if (tags.length === 0) return null;

  return (
    <ul
      aria-label={boardText("Теги")}
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {tags.map((tag) => (
        <li key={tag.id}>
          <span
            className={`inline-block rounded-sm px-1.5 py-0.5 text-xs font-medium ${taskTagToneStyles[tag.tone] ?? "bg-board-selected text-board-secondary"}`}
            style={customTaskTagToneStyle(tag.tone)}
          >
            {tag.name}
          </span>
        </li>
      ))}
    </ul>
  );
};
