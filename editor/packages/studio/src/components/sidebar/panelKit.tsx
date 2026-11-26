// Shared building blocks for the left rail panels, sized to the St-* boards:
// 24px card with 16px padding and 14px gaps, Sora 17px title, 40px search field (14px radius),
// 30px outlined pill chips, a pill radiogroup, section headings and 40/34/30px pill buttons.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useIsPhone } from "../shell/useIsPhone";
import { PanelIcon, type PanelIconName } from "./panelIcons";

export interface PanelCardProps {
  /** Accessible name and visible title. */
  title: string;
  /** Icon button(s) to the right of the title. */
  actions?: ReactNode;
  /** Pinned under the scrolling body (import button, lint button). */
  footer?: ReactNode;
  children: ReactNode;
  /** Extra attributes for drop targets. */
  dropProps?: React.HTMLAttributes<HTMLElement>;
  dropActive?: boolean;
}

/**
 * The side panel card. On phone the shell's bottom sheet already shows the title and frame,
 * so only the body and footer render there.
 */
export function PanelCard({
  title,
  actions,
  footer,
  children,
  dropProps,
  dropActive,
}: PanelCardProps) {
  const isPhone = useIsPhone();
  const ring = dropActive ? " shadow-[inset_0_0_0_2px_var(--st-tx)]" : "";
  if (isPhone) {
    return (
      <section
        aria-label={title}
        data-side-panel=""
        className={`flex h-full min-h-0 w-full flex-col gap-3.5 px-4 pb-4${ring}`}
        {...dropProps}
      >
        {children}
        {footer ? <div className="flex flex-none flex-col gap-2">{footer}</div> : null}
      </section>
    );
  }
  return (
    <section
      aria-label={title}
      data-side-panel=""
      className={`flex h-full min-h-0 flex-col gap-3.5 overflow-hidden rounded-card bg-studio-surface p-4 text-studio-text shadow-studio${ring}`}
      {...dropProps}
    >
      <div className="flex min-h-8 flex-none items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold leading-6">
          {title}
        </h2>
        {actions}
      </div>
      {children}
      {footer ? <div className="flex flex-none flex-col gap-2">{footer}</div> : null}
    </section>
  );
}

/** Scrolling body between the controls and the footer. */
export function PanelBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelIconButton({
  icon,
  label,
  size = 32,
  ...rest
}: { icon: PanelIconName; label: string; size?: 32 | 36 } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex flex-none items-center justify-center rounded-full text-studio-text transition-colors hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] disabled:cursor-not-allowed disabled:opacity-40 ${size === 36 ? "h-9 w-9" : "h-8 w-8"}`}
      {...rest}
    >
      <PanelIcon name={icon} />
    </button>
  );
}

export function PanelSearch({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="relative flex h-10 flex-none items-center rounded-md bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-sbd)] focus-within:shadow-[inset_0_0_0_1.5px_var(--st-tx)]">
      <span className="pointer-events-none absolute left-3 flex text-[var(--st-t3)]">
        <PanelIcon name="search" />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        aria-label={label}
        className="h-full min-w-0 flex-1 rounded-md bg-transparent pl-[38px] pr-3 text-[13px] text-studio-text outline-none placeholder:text-[var(--st-t3)]"
      />
    </label>
  );
}

const PILL_SIZE = {
  48: "h-12 px-4 text-[13px]",
  44: "h-11 px-[18px] text-[13px]",
  40: "h-10 px-4 text-[13px]",
  34: "h-[34px] px-3 text-xs",
  30: "h-[30px] px-[11px] text-xs",
  28: "h-7 px-3 text-xs",
} as const;

const PILL_VARIANT = {
  primary: "bg-studio-accent text-studio-on-accent hover:opacity-90",
  secondary:
    "bg-transparent text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]",
  selected: "bg-studio-selected text-studio-on-selected",
  danger: "bg-[var(--st-danger)] text-studio-on-accent hover:opacity-90",
  ghost: "bg-transparent text-studio-text hover:bg-[var(--st-sub)]",
} as const;

export type PanelPillVariant = keyof typeof PILL_VARIANT;

/** Pill button at the board sizes (40 footer, 34 popover, 30 chips and card actions). */
export function PanelPill({
  variant = "secondary",
  size = 40,
  icon,
  className = "",
  children,
  ...rest
}: {
  variant?: PanelPillVariant;
  size?: keyof typeof PILL_SIZE;
  icon?: PanelIconName;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] disabled:cursor-not-allowed disabled:opacity-40 ${PILL_SIZE[size]} ${PILL_VARIANT[variant]} ${className}`}
      {...rest}
    >
      {icon ? <PanelIcon name={icon} /> : null}
      {children}
    </button>
  );
}

/**
 * Outlined filter chip; the selected chip fills with the selected token.
 * `max-sm:` mirrors PHONE_QUERY (max-width 639px) at the default root font size.
 */
export function PanelChip({
  pressed,
  onClick,
  children,
  count,
  role,
  tone = "outline",
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  role?: "radio";
  /** "soft": surface chip with a 1px border and secondary text (media filters). */
  tone?: "outline" | "soft";
}) {
  const idle =
    tone === "soft"
      ? "bg-studio-surface text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
      : PILL_VARIANT.secondary;
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? pressed : undefined}
      aria-pressed={role ? undefined : pressed}
      onClick={onClick}
      className={`inline-flex h-[30px] max-sm:h-11 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${
        tone === "soft" ? "px-3" : "px-[11px]"
      } ${pressed ? PILL_VARIANT.selected : idle}`}
    >
      {children}
      {count != null ? <span className="tabular-nums opacity-[.72]">{count}</span> : null}
    </button>
  );
}

export function PanelChipGroup({
  label,
  radio,
  children,
}: {
  label: string;
  radio?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role={radio ? "radiogroup" : "group"}
      aria-label={label}
      className="flex flex-none flex-wrap gap-1.5"
    >
      {children}
    </div>
  );
}

/** Two or three equal pill options in an outlined track (Proiect / Toate, Cod / Compoziții). */
export function PanelSegment<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-none gap-0.5 rounded-full bg-studio-surface p-[3px] shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`h-8 max-sm:h-11 min-w-0 flex-1 truncate rounded-full px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${
              selected
                ? "bg-studio-selected font-semibold text-studio-on-selected"
                : "font-medium text-[var(--st-t2)] hover:bg-[var(--st-sub)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Video 4" style section heading inside a panel body. */
export function PanelSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex min-h-5 items-center gap-1.5">
        <b className="text-[13px] font-semibold">{title}</b>
        {count != null ? (
          <span className="text-xs font-semibold tabular-nums text-[var(--st-t3)]">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Small number badge (lint findings) next to a row or the lint button. */
export function CountBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="inline-flex h-[18px] min-w-5 flex-none items-center justify-center rounded-[6px] bg-[var(--st-warn-bg)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--st-warn-text)]"
    >
      {count}
    </span>
  );
}

/** Centered illustration + title (+ one action), used for empty, no-match and error states. */
export function PanelMessage({
  illustration,
  title,
  action,
  role,
}: {
  illustration?: string;
  title: string;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-3 px-2 py-6 text-center">
      {illustration ? (
        <img
          src={illustration}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-[120px] w-[120px] object-contain"
        />
      ) : null}
      <b className="text-sm font-semibold leading-5">{title}</b>
      {action}
    </div>
  );
}

/** Thin progress bar (import, music preview). `value` null = indeterminate. */
export function PanelProgress({ value, label }: { value: number | null; label: string }) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      className="relative block h-1.5 overflow-hidden rounded-full bg-[var(--st-hd)]"
    >
      <span
        className={`absolute inset-y-0 left-0 rounded-full bg-[var(--st-tx)] ${value == null ? "w-full animate-pulse opacity-60" : ""}`}
        style={value == null ? undefined : { width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}

const TAG_TONE = {
  ok: "bg-[var(--st-ok-bg)] text-[var(--st-ok)]",
  danger: "bg-[var(--st-danger-bg)] text-[var(--st-danger)]",
  neutral: "bg-[var(--st-sub)] text-[var(--st-t2)]",
} as const;

/** Small status tag ("Adăugat", "În uz", "Copiat", "BGM"): 8px radius, 12px semibold. */
export function PanelTag({
  tone,
  icon,
  height = 20,
  role,
  children,
}: {
  tone: keyof typeof TAG_TONE;
  icon?: PanelIconName;
  height?: 20 | 22 | 24 | 28;
  role?: "status";
  children: ReactNode;
}) {
  return (
    <span
      role={role}
      style={{ height }}
      className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 text-xs font-semibold ${TAG_TONE[tone]}`}
    >
      {icon ? <PanelIcon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
