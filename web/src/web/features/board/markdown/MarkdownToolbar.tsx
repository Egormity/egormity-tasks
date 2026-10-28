import { Bold, Code, Italic, Link, List, type LucideIcon } from "lucide-react";

import { boardText } from "../i18n/board-copy";
import type { MarkdownFormat } from "./markdown-format";

type FormatAction = {
  readonly format: MarkdownFormat;
  readonly icon: LucideIcon;
  readonly label: string;
};

const formatActions: readonly FormatAction[] = [
  { format: "bold", icon: Bold, label: "Жирный" },
  { format: "italic", icon: Italic, label: "Курсив" },
  { format: "code", icon: Code, label: "Код" },
  { format: "link", icon: Link, label: "Ссылка" },
  { format: "list", icon: List, label: "Маркированный список" },
];

type MarkdownToolbarProps = {
  readonly disabled?: boolean | undefined;
  readonly onFormat: (format: MarkdownFormat) => void;
};

export const MarkdownToolbar = ({ disabled = false, onFormat }: MarkdownToolbarProps) => (
  <div
    aria-label={boardText("Инструменты форматирования")}
    className="flex items-center gap-0.5"
    role="group"
  >
    {formatActions.map(({ format, icon: Icon, label }) => (
      <button
        key={format}
        aria-label={boardText(label)}
        className="text-board-icon hover:bg-board-input-surface hover:text-board-accent focus-visible:ring-board-accent grid size-6 place-items-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
        disabled={disabled}
        title={boardText(label)}
        type="button"
        onClick={() => onFormat(format)}
      >
        <Icon aria-hidden="true" size={13} />
      </button>
    ))}
  </div>
);
