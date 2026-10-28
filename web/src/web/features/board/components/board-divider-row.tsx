import { useDraggable } from "@dnd-kit/react";
import { GripVertical } from "lucide-react";
import type { RefCallback } from "react";

import type { BoardDivider } from "@contracts/board-columns.js";
import { boardText } from "@/features/board/i18n/board-copy";

type BoardDividerVisualProps = {
  readonly divider: BoardDivider;
  readonly rowRef?: RefCallback<HTMLElement> | undefined;
  readonly handleRef?: RefCallback<HTMLButtonElement> | undefined;
  readonly dragDisabled?: boolean | undefined;
  readonly isDragging?: boolean | undefined;
  readonly isOverlay?: boolean | undefined;
};

const BoardDividerVisual = ({
  divider,
  rowRef,
  handleRef,
  dragDisabled = false,
  isDragging = false,
  isOverlay = false,
}: BoardDividerVisualProps) => (
  <div
    className={`flex min-h-9 items-center gap-1 px-1 ${
      isDragging ? "opacity-40" : ""
    } ${isOverlay ? "border-board-drag bg-board-column-surface shadow-board-drag rounded-sm border px-2" : ""}`}
    ref={rowRef}
  >
    <span
      aria-label={divider.title}
      className="flex min-w-0 flex-1 items-center gap-2"
      role="separator"
    >
      <span aria-hidden="true" className="bg-board-divider h-0.5 min-w-3 flex-1" />
      <span className="text-board-secondary max-w-48 truncate text-center text-[11px]">
        {divider.title}
      </span>
      <span aria-hidden="true" className="bg-board-divider h-0.5 min-w-3 flex-1" />
    </span>
    {!isOverlay && (
      <button
        aria-label={boardText("Переместить разделитель: {0}", divider.title)}
        className="text-board-icon hover:bg-board-selected hover:text-board-accent-hover focus-visible:ring-board-accent grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        disabled={dragDisabled}
        ref={handleRef}
        title={boardText("Переместить разделитель: {0}", divider.title)}
        type="button"
      >
        <GripVertical aria-hidden="true" className="size-3" />
      </button>
    )}
  </div>
);

export const DraggableBoardDivider = ({
  divider,
  dragDisabled,
}: {
  readonly divider: BoardDivider;
  readonly dragDisabled: boolean;
}) => {
  const { handleRef, isDragging, ref } = useDraggable({
    data: { dividerId: divider.id },
    disabled: dragDisabled,
    id: divider.id,
    type: "divider",
  });

  return (
    <BoardDividerVisual
      divider={divider}
      dragDisabled={dragDisabled}
      handleRef={handleRef}
      isDragging={isDragging}
      rowRef={ref}
    />
  );
};

export const BoardDividerOverlay = ({ divider }: { readonly divider: BoardDivider }) => (
  <BoardDividerVisual divider={divider} isOverlay />
);
