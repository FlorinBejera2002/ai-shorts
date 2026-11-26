// Presentational controls of the timeline toolbar (St-Timeline-Tools): round icon buttons,
// the separator, the auto-record dot, the zoom slider and the pill actions.
import type { ReactNode } from "react";
import { Tooltip } from "../ui";
import { TimelineIcon, type TimelineIconName } from "../../player/components/TimelineIcon";

interface ToolButtonProps {
  icon: TimelineIconName;
  label: string;
  tip?: string;
  /** Selected tool or switched-on toggle: filled with the selection colour. */
  pressed?: boolean;
  /** Renders aria-pressed even when false, for toggles. */
  toggle?: boolean;
  disabled?: boolean;
  size?: number;
  onClick?: () => void;
}

export function ToolButton({
  icon,
  label,
  tip,
  pressed = false,
  toggle = false,
  disabled = false,
  size = 32,
  onClick,
}: ToolButtonProps) {
  return (
    <Tooltip label={tip ?? label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={toggle ? pressed : undefined}
        disabled={disabled}
        onClick={onClick}
        data-timeline-tool={icon}
        className={`flex flex-none items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-tx)] ${
          pressed
            ? "bg-[var(--st-sel)] text-[var(--st-on-sel)]"
            : "bg-transparent text-[var(--st-tx)] hover:bg-[var(--st-sub)]"
        } ${disabled ? "cursor-not-allowed opacity-[.38] hover:bg-transparent" : ""}`}
        style={{ width: size, height: size }}
      >
        <TimelineIcon name={icon} size={16} />
      </button>
    </Tooltip>
  );
}

export function ToolSeparator() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px flex-none bg-[var(--st-bd)]" />;
}

/** The auto-record switch: a filled danger dot while recording, a hollow ring when off. */
export function RecordButton({
  on,
  label,
  tip,
  onToggle,
}: {
  on: boolean;
  label: string;
  tip: string;
  onToggle: () => void;
}) {
  return (
    <Tooltip label={tip}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        onClick={onToggle}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-transparent hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-tx)]"
      >
        <span
          aria-hidden="true"
          className={`block h-3 w-3 rounded-full ${
            on ? "bg-[var(--st-danger)]" : "shadow-[inset_0_0_0_2px_var(--st-t2)]"
          }`}
        />
      </button>
    </Tooltip>
  );
}

/** Secondary pill: 30px, transparent with the secondary border (Potrivește, zoom readout). */
export function ToolPill({
  children,
  label,
  tip,
  pressed,
  onClick,
}: {
  children: ReactNode;
  label?: string;
  tip?: string;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex h-[30px] flex-none items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-semibold text-[var(--st-tx)] shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-tx)]"
    >
      {children}
    </button>
  );
  return tip ? <Tooltip label={tip}>{button}</Tooltip> : button;
}

/** Zoom range: 96px, 4px track filled up to the thumb, 14px thumb with a ring. The input keeps
 *  a 24px box (h-6) so the pointer target meets WCAG 2.5.8. */
export function ZoomSlider({
  value,
  label,
  title,
  onChange,
}: {
  value: number;
  label: string;
  title: string;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      min="0"
      max="100"
      value={value}
      title={title}
      aria-label={label}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{
        background: `linear-gradient(to right, var(--st-tx) 0 ${value}%, var(--st-hd) ${value}% 100%) center / 100% 4px no-repeat`,
      }}
      className="mx-1 h-6 w-[96px] flex-none cursor-pointer appearance-none rounded-full bg-transparent [&::-webkit-slider-runnable-track]:h-[4px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--st-sf)] [&::-webkit-slider-thumb]:shadow-[0_0_0_1.5px_var(--st-tx)] [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--st-sf)] [&::-moz-range-thumb]:shadow-[0_0_0_1.5px_var(--st-tx)]"
    />
  );
}
