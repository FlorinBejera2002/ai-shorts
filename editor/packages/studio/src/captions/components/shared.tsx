import type React from "react";
import { useId } from "react";
import { InspectorRange, InspectorSelect } from "../../components/editor/inspectorControls";

// St-Captions / St-Inspector-Cap*: titled sections holding half-width sliders (label and value
// on one line, the track below) and full-width 44px selects. Token colours only.

export function Section({
  label,
  children,
  columns = 2,
}: {
  label: string;
  children: React.ReactNode;
  /** 2 lays the rows out as a two-column grid (X | Y, Scară | Rotație). */
  columns?: 1 | 2;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2.5">
      <h3 className="text-[13px] font-semibold text-studio-text">{label}</h3>
      <div className={columns === 2 ? "grid grid-cols-2 gap-x-4 gap-y-3" : "flex flex-col gap-2.5"}>
        {children}
      </div>
    </section>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** True when a multi-selection has differing values: the value reads "Mixt". */
  mixed?: boolean;
  mixedLabel: string;
  disabled?: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

/** A half-width slider: "X     50%" over the track (St-Captions). */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  mixed = false,
  mixedLabel,
  disabled,
  format,
  onChange,
}: SliderFieldProps) {
  const id = useId();
  const clamped = Math.min(max, Math.max(min, value));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <label htmlFor={id} className="truncate font-medium text-studio-text">
          {label}
        </label>
        <output htmlFor={id} className="flex-none font-semibold tabular-nums text-studio-muted">
          {mixed ? mixedLabel : format(value)}
        </output>
      </div>
      <InspectorRange
        id={id}
        value={clamped}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(next) => {
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </div>
  );
}

export interface SelectChoice {
  value: string;
  label: string;
}

/** Full-width 44px select; a value outside the list is kept as its own option. */
export function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly SelectChoice[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const choices = options.some((option) => option.value === value)
    ? options
    : [{ value, label: value }, ...options];
  return (
    <InspectorSelect
      label={label}
      value={value}
      options={choices}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
