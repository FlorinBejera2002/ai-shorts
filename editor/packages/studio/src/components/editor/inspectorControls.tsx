// Inspector building blocks drawn from the Inspector boards (St-Main, St-Sound, St-Subtitles,
// St-Framing): a titled section, a labelled slider with its value on the right, a switch row,
// a 44px select, a full-width segment and small pill actions. Token colours only.
import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import { PillButton, Switch } from "../ui";
import type { PillButtonProps } from "../ui";

export function InspectorSection({
  title,
  action,
  children,
  label,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  return (
    <section aria-label={label ?? title} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-studio-text">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small outlined pill ("Aplică la toate" next to a section title). */
export function InspectorPill({ className = "", ...rest }: PillButtonProps) {
  return (
    <PillButton
      variant="secondary"
      size="sm"
      className={`!h-7 !px-3 text-xs !font-semibold ${className}`}
      {...rest}
    />
  );
}

/** Full-width footer action, 44px (primary or secondary). */
export function InspectorAction({ className = "", ...rest }: PillButtonProps) {
  return <PillButton size="md" className={`w-full !font-semibold ${className}`} {...rest} />;
}

export interface InspectorSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format?: (value: number) => string;
  ariaLabel?: string;
  onChange: (value: number) => void;
  /** Called on release (pointer up, key up, blur): the value worth saving. A blur passes
   *  the element receiving focus, so a caller can skip a save that another action replaces. */
  onCommit?: (relatedTarget?: EventTarget | null) => void;
}

const RANGE_CLASS = [
  "block h-4 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-45",
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--st-btn)]",
  "[&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none",
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--st-sf)]",
  "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--st-tx)]",
  "[&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full",
  "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--st-sf)]",
  "[&::-moz-range-thumb]:shadow-[0_0_0_2px_var(--st-tx)]",
].join(" ");

/** The board slider: 4px track in --st-hd, filled part in --st-tx, 18px ringed thumb. */
export function rangeTrackStyle(value: number, min: number, max: number): CSSProperties {
  const span = max - min || 1;
  const percent = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  return {
    background: `linear-gradient(var(--st-tx), var(--st-tx)) 0 50% / ${percent}% 4px no-repeat, linear-gradient(var(--st-hd), var(--st-hd)) 0 50% / 100% 4px no-repeat`,
  };
}

export function InspectorRange({
  value,
  min,
  max,
  step = 1,
  disabled,
  ariaLabel,
  id,
  onChange,
  onCommit,
}: Omit<InspectorSliderProps, "label" | "format"> & { id?: string }) {
  // Arrow keys step the value; save once the keys rest so one burst is one undo step.
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushKeys = () => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
    keyTimer.current = null;
  };
  return (
    <input
      id={id}
      type="range"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      className={RANGE_CLASS}
      style={rangeTrackStyle(value, min, max)}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      onPointerUp={() => onCommit?.()}
      onKeyUp={() => {
        flushKeys();
        keyTimer.current = setTimeout(() => {
          keyTimer.current = null;
          onCommit?.();
        }, 400);
      }}
      onBlur={(event) => {
        flushKeys();
        onCommit?.(event.relatedTarget);
      }}
    />
  );
}

export function InspectorSlider({ label, format = String, ...range }: InspectorSliderProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <label htmlFor={id} className="font-medium text-studio-text">
          {label}
        </label>
        <output htmlFor={id} className="font-semibold tabular-nums text-studio-muted">
          {format(range.value)}
        </output>
      </div>
      <InspectorRange id={id} {...range} />
    </div>
  );
}

export function InspectorSwitchRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-studio-text">{label}</span>
      <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export interface InspectorChoice<T extends string> {
  value: T;
  label: string;
}

export function InspectorSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  icon,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly InspectorChoice<T>[];
  disabled?: boolean;
  icon?: ReactNode;
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-studio-text">
          {icon}
        </span>
      )}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.currentTarget.value);
          if (next) onChange(next.value);
        }}
        className={[
          "h-11 w-full cursor-pointer appearance-none rounded-md bg-studio-surface pr-10 text-[13px] font-medium text-studio-text",
          "shadow-[inset_0_0_0_1.5px_var(--st-sbd)] outline-none disabled:cursor-not-allowed disabled:opacity-45",
          "focus-visible:shadow-[inset_0_0_0_2px_var(--st-btn)]",
          icon ? "pl-10" : "pl-4",
        ].join(" ")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-studio-text"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}

/** Full-width pill segment with an outline (Umple / Încadrează / Întinde). */
export function InspectorSegment<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly InspectorChoice<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 gap-0.5 rounded-full bg-studio-surface p-1 shadow-[inset_0_0_0_1.5px_var(--st-bd)]"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={[
              "h-10 min-w-0 flex-1 truncate rounded-full px-2 text-[13px] transition-colors disabled:opacity-45",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-btn)]",
              selected
                ? "bg-studio-selected font-semibold text-studio-on-selected"
                : "font-medium text-studio-text hover:bg-[var(--st-sub)]",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InspectorError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-xs font-medium text-studio-danger">
      {children}
    </p>
  );
}

/** Inline stroke icon used across the inspector (24px grid). */
export function InspectorIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block flex-none"
    >
      <path d={d} />
    </svg>
  );
}

export const ICON_PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5v14l11-7z",
  check: "M5 12l5 5L20 7",
  sparkle:
    "M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  chevron: "M9 6l6 6-6 6",
  dot: "M12 12h.01",
} as const;
