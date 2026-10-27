import type { TaskTagTone } from "@/features/board/data/task-data";

import { boardText } from "@/features/board/i18n/board-copy";

const toneOptions: readonly {
  readonly label: string;
  readonly swatch: string;
  readonly value: TaskTagTone;
}[] = [
  { label: "Фиолетовый", swatch: "bg-board-violet", value: "violet" },
  { label: "Зелёный", swatch: "bg-board-green", value: "green" },
  { label: "Янтарный", swatch: "bg-board-amber", value: "amber" },
  { label: "Синий", swatch: "bg-board-blue", value: "blue" },
  { label: "Розовый", swatch: "bg-board-rose", value: "rose" },
];

type TaskTagToneSwatchesProps = {
  readonly compact?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly label: string;
  readonly onChange: (tone: TaskTagTone) => void;
  readonly value: TaskTagTone;
};

export const TaskTagToneSwatches = ({
  compact = false,
  disabled = false,
  label,
  onChange,
  value,
}: TaskTagToneSwatchesProps) => (
  <div
    aria-label={label}
    className={`flex items-center ${compact ? "gap-0.5" : "gap-1.5"}`}
    role="radiogroup"
  >
    {toneOptions.map((tone) => (
      <button
        aria-label={boardText(tone.label)}
        aria-checked={value === tone.value}
        className={`focus-visible:ring-board-accent grid place-items-center rounded-full border-2 transition focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${compact ? "size-6" : "size-7"} ${value === tone.value ? "border-board-input-text" : "hover:border-board-border-hover border-transparent"}`}
        disabled={disabled}
        key={tone.value}
        onClick={() => onChange(tone.value)}
        role="radio"
        type="button"
      >
        <span className={`${compact ? "size-3" : "size-4"} rounded-full ${tone.swatch}`} />
      </button>
    ))}
  </div>
);
