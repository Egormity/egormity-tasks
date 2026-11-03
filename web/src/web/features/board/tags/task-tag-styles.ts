import type { TaskTagTone } from "@/features/board/data/task-data";

export const taskTagToneStyles: Readonly<Record<string, string>> = {
  amber: "bg-board-amber-surface text-board-amber",
  blue: "bg-board-blue-surface text-board-blue",
  green: "bg-board-green-surface text-board-green",
  rose: "bg-board-rose-surface text-board-rose",
  violet: "bg-board-violet-surface text-board-violet",
};

const hexColorPattern = /^#[0-9a-f]{6}$/iu;
// Blend with the current theme so custom colors are visible without solid neon chips.
export const customTaskTagToneStyle = (tone: TaskTagTone) =>
  hexColorPattern.test(tone)
    ? {
        backgroundColor: `color-mix(in srgb, ${tone} 16%, var(--color-board-surface))`,
        borderColor: `color-mix(in srgb, ${tone} 32%, var(--color-board-surface))`,
        color: `color-mix(in srgb, ${tone} 20%, var(--color-board-text))`,
      }
    : undefined;
