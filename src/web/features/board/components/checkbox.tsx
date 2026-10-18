import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";

import { classNames } from "./class-names";

type TrackerCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const TrackerCheckbox = ({ className, ...props }: TrackerCheckboxProps) => (
  <span className={classNames("relative inline-flex size-5 shrink-0", className)}>
    <input
      {...props}
      className="peer absolute inset-0 z-10 size-5 cursor-pointer appearance-none rounded-md opacity-0 outline-none disabled:cursor-not-allowed"
      type="checkbox"
    />
    <span className="border-board-border-hover bg-board-surface peer-checked:border-board-accent peer-checked:bg-board-accent peer-checked:text-board-on-accent peer-focus-visible:ring-board-accent/35 pointer-events-none grid size-5 place-items-center rounded-md border text-transparent transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:opacity-45">
      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
    </span>
  </span>
);
