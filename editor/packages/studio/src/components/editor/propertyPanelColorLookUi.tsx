// Shared building blocks for the look sections (Grade, Effects, Overlays, Audio FX), drawn on the
// Studio tokens: titles only, 14px fields, pill actions, white rows with borders (no grey fills).
import type { ComponentProps, ReactNode } from "react";
import { FlatSlider } from "./propertyPanelFlatPrimitives";
import "./propertyPanelLook.css";

/** Back row inside a group view ("‹ Efecte"): returns to the parent list. */
export function LookBack({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-look-back="true"
      onClick={onClick}
      className="-ml-1 flex h-8 items-center gap-1 self-start rounded-full pr-2 pl-1 text-[13px] font-semibold text-studio-text hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
    >
      <LookIcon d={LOOK_ICONS.chevronLeft} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Section title inside an inspector group: 13px semibold, no helper text. */
export function LookTitle({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-6 items-center justify-between gap-2 ${className}`}>
      <h4 className="min-w-0 truncate text-[13px] font-semibold text-studio-text">{children}</h4>
      {action}
    </div>
  );
}

/** A titled block; blocks are separated by gap only (no hairlines). */
export function LookBlock({
  title,
  action,
  children,
  ...rest
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <section className="flex flex-col gap-2.5" {...rest}>
      {title != null && <LookTitle action={action}>{title}</LookTitle>}
      {children}
    </section>
  );
}

export function LookIcon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d={d} />
    </svg>
  );
}

export const LOOK_ICONS = {
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  settings: "M12 8v8M8 12h8M4 6h4M16 6h4M4 18h10M18 18h2",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  eyeOff:
    "M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3 3.9M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.7 9.7 0 005.4-1.6",
  reset: "M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8M4 4v4h4",
  refresh: "M20 12a8 8 0 11-2.3-5.7L20 8M20 4v4h-4",
  dropper: "M14 4l6 6-2 2-6-6zM12 6l-8 8v4h4l8-8",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5v.01",
  check: "M5 12l5 5 9-10",
  more: "M12 5.5v.01M12 12v.01M12 18.5v.01",
} as const;

const ICON_BUTTON_SIZE = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" } as const;

/** Round 32px icon button for row actions (move, delete, settings). */
export function LookIconButton({
  label,
  icon,
  onClick,
  disabled,
  pressed,
  danger,
  size = "md",
  ...rest
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
  /** md is the 32px row action, sm (24px) sits beside a slider value, lg (40px) is a toolbar. */
  size?: "sm" | "md" | "lg";
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex ${ICON_BUTTON_SIZE[size]} flex-none items-center justify-center rounded-full transition-colors hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "text-studio-danger" : "text-studio-text"
      } ${pressed ? "bg-[var(--st-sub)]" : ""}`}
      {...rest}
    >
      <LookIcon d={icon} />
    </button>
  );
}

/** White row with a border, 14px radius; used for list items and option cards. */
export const LOOK_ROW =
  "rounded-md bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)] transition-colors";

/** Status line for errors: danger tint, title-length text. */
export function LookAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-md bg-[var(--st-danger-bg)] px-3.5 py-3 text-[13px] font-medium text-studio-danger"
    >
      <LookIcon d={LOOK_ICONS.alert} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Two-column slider grid used by Light / Color / Secondary (St-Inspector-GradeSliders). */
export const LOOK_SLIDER_GRID = "grid grid-cols-2 gap-2.5";

// Board slider (St-Grade): label and value on one line, the track under them, an 18px ring
// knob. The geometry lives in propertyPanelLook.css; the shared FlatSlider keeps drag, keyboard,
// throttled commit and reset behaving exactly as everywhere else in the inspector.
export function LookSlider(props: ComponentProps<typeof FlatSlider>) {
  return (
    <div className="min-w-0" data-look-slider="true">
      <FlatSlider {...props} />
    </div>
  );
}
