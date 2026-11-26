// Range slider with a visible value. The native thumb (rounded-full) takes the primary accent.
export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (next) => String(next),
  disabled = false,
}: SliderProps) {
  return (
    <label className="flex items-center gap-3 text-sm text-studio-text">
      <span className="w-20 flex-none truncate text-studio-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="min-w-0 flex-1 accent-[var(--st-btn)] disabled:opacity-45"
      />
      <span className="w-12 flex-none text-right tabular-nums text-studio-muted">
        {format(value)}
      </span>
    </label>
  );
}
