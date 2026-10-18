import { ChevronDown } from "lucide-react";

type SelectProps<Value extends string> = {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
  readonly hideLabel?: boolean;
  readonly className?: string;
};

export const Select = <Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  hideLabel = false,
  className = "",
}: SelectProps<Value>) => (
  <label className="text-muted grid min-w-0 gap-1 text-xs">
    <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    <span className="relative block min-w-0">
      <select
        className={`border-line bg-canvas text-ink focus-visible:border-accent focus-visible:ring-accent w-full min-w-0 appearance-none rounded-lg border py-2 pr-8 pl-3 outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const option = options.find((item) => item.value === event.target.value);
          if (option) onChange(option.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2"
      />
    </span>
  </label>
);
