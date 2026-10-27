import type { TaskTagTone } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";
import { colorInputValue } from "@/features/board/color-picker-utils";

const legacyToneColors: Record<string, string> = {
  violet: "var(--color-board-violet)",
  green: "var(--color-board-green)",
  amber: "var(--color-board-amber)",
  blue: "var(--color-board-blue)",
  rose: "var(--color-board-rose)",
};

type TaskTagToneSwatchesProps = {
  readonly compact?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly label: string;
  readonly onChange: (tone: TaskTagTone) => void;
  readonly value: TaskTagTone;
};

export const TaskTagColorPicker = ({
  compact = false,
  disabled = false,
  label,
  onChange,
  value,
}: TaskTagToneSwatchesProps) => (
  <input
    aria-label={boardText(label)}
    className={`border-board-input-border focus-visible:ring-board-accent cursor-pointer rounded-md border p-0.5 focus-visible:ring-2 ${compact ? "size-6" : "size-7"}`}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    type="color"
    value={colorInputValue(legacyToneColors[value] ?? value)}
  />
);
