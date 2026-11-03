import type { TaskTagTone } from "@/features/board/data/task-data";

export const taskTagToneStyles: Readonly<Record<string, string>> = {
  amber: "bg-board-amber-surface text-board-amber",
  blue: "bg-board-blue-surface text-board-blue",
  green: "bg-board-green-surface text-board-green",
  rose: "bg-board-rose-surface text-board-rose",
  violet: "bg-board-violet-surface text-board-violet",
};

const hexColorPattern = /^#[0-9a-f]{6}$/iu;
const darkInk = "#000000";
const lightInk = "#ffffff";

const linearChannel = (channel: number) =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const relativeLuminance = (hex: string) => {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) =>
    linearChannel(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (first: number, second: number) =>
  (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);

// Picks whichever ink gives the higher WCAG contrast against the picked color.
export const customTaskTagInk = (hex: string) => {
  const luminance = relativeLuminance(hex);
  return contrastRatio(luminance, relativeLuminance(darkInk)) >=
    contrastRatio(luminance, relativeLuminance(lightInk))
    ? darkInk
    : lightInk;
};

export const customTaskTagToneStyle = (tone: TaskTagTone) =>
  hexColorPattern.test(tone)
    ? {
        backgroundColor: tone,
        borderColor: tone,
        color: customTaskTagInk(tone),
      }
    : undefined;
