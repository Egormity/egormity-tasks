import { Plus } from "lucide-react";
import { toast } from "sonner";

import { boardText } from "@/features/board/i18n/board-copy";

type CreateTaskButtonProps = {
  readonly compact?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
};

export const CreateTaskButton = ({ compact = false, onClick }: CreateTaskButtonProps) => (
  <button
    className={
      compact
        ? "border-board-accent/20 bg-board-accent/8 text-board-accent hover:bg-board-accent/14 focus-visible:ring-board-accent inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2"
        : "bg-board-accent text-board-on-accent shadow-board-button hover:bg-board-accent-hover focus-visible:ring-board-accent inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-offset-2"
    }
    onClick={onClick ?? (() => toast.info(boardText("Откройте доску, чтобы создать задачу")))}
    type="button"
  >
    <Plus aria-hidden="true" className="size-4" strokeWidth={2.2} />
    {compact ? boardText("Новая задача") : boardText("Создать задачу")}
  </button>
);
