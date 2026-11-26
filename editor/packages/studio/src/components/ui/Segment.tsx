// Segmented control: one selected option, pill container, 999px radius.
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentProps<T extends string> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Segment<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: SegmentProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex gap-0.5 rounded-full bg-studio-surface p-1 shadow-studio ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={[
              "h-9 whitespace-nowrap rounded-full px-4 text-sm transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]",
              selected
                ? "bg-studio-selected font-semibold text-studio-on-selected"
                : "font-medium text-studio-muted hover:bg-[var(--st-sub)] hover:text-studio-text",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
