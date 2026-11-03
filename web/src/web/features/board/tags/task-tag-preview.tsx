import type { TaskTagTone } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { customTaskTagToneStyle, taskTagToneStyles } from "./task-tag-styles";

type TaskTagPreviewProps = {
  readonly name: string;
  readonly tone: TaskTagTone;
};

// Mirrors the chip styling used on task cards so the preview matches the board.
export const TaskTagPreview = ({ name, tone }: TaskTagPreviewProps) => {
  const label = name.trim();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-board-subtle shrink-0 text-[10px]">
        {boardText("Предпросмотр")}
      </span>
      <span
        className={`max-w-[10rem] truncate rounded-sm px-1.5 py-0.5 text-[12px] leading-3 font-medium ${taskTagToneStyles[tone] ?? "bg-board-selected text-board-secondary"} ${label ? "" : "opacity-50"}`}
        style={customTaskTagToneStyle(tone)}
      >
        {label || boardText("Название тега")}
      </span>
    </div>
  );
};
