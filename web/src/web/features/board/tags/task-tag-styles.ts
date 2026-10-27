import type { TaskTagTone } from "@/features/board/data/task-data";

export const taskTagToneStyles: Readonly<Record<string, string>> = {
  amber: "bg-board-amber-surface text-board-amber",
  blue: "bg-board-blue-surface text-board-blue",
  green: "bg-board-green-surface text-board-green",
  rose: "bg-board-rose-surface text-board-rose",
  violet: "bg-board-violet-surface text-board-violet",
};

export const customTaskTagToneStyle = (tone: TaskTagTone) =>
  /^#[0-9a-f]{6}$/iu.test(tone)
    ? {
        backgroundColor: `${tone}22`,
        borderColor: `${tone}66`,
        color: "var(--color-board-text)",
      }
    : undefined;
