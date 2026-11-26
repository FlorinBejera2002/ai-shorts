// Shared look of the preview card chrome (St-Preview-* boards): stroke icons, round icon buttons,
// outline pills, floating popovers and menu rows. Colours come from the --st-* tokens; canvas
// chrome drawn over the video itself (handles, guides) stays white so it reads on any frame.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

const PATHS = {
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M8 11h6",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3M11 8v6M8 11h6",
  prevFrame: "M6 5v14M18 5l-9 7 9 7z",
  nextFrame: "M18 5v14M6 5l9 7-9 7z",
  volume: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  volumeLow: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7",
  muted: "M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6",
  fullscreen: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  exitFullscreen: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  loop: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 18l-6-6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  check: "M5 12l5 5 9-10",
  magnet: "M5 4v7a7 7 0 0 0 14 0V4h-4v7a3 3 0 0 1-6 0V4z",
  grid: "M4 4h16v16H4zM7.5 9.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M4 16l5-5 4 4 2-2 5 5",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  record: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  stop: "M7 7h10v10H7z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  crop: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4",
  tools: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M18 18h2",
  captions: "M4 5h16v14H4zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3",
  warning: "M12 4l9 16H3zM12 10v4M12 17v.01",
  refresh: "M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  toFront: "M6 11l6-6 6 6M6 17l6-6 6 6",
  forward: "M6 15l6-6 6 6",
  backward: "M6 9l6 6 6-6",
  toBack: "M6 7l6 6 6-6M6 13l6 6 6-6",
  pause: "M8 5v14M16 5v14",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  music: "M9 18V5l12-2v13M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
} as const;

export type PreviewIconName = keyof typeof PATHS;

const FILLED: ReadonlySet<PreviewIconName> = new Set(["stop"]);

export function PreviewIcon({
  name,
  size = 18,
  strokeWidth = 2,
  className,
}: {
  name: PreviewIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block flex-none ${className ?? ""}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Floating popover shadow from the boards (card shadow plus a soft drop). */
export const POPOVER_SHADOW =
  "[box-shadow:var(--st-sh),0_16px_40px_color-mix(in_srgb,black_16%,transparent)]";
/** Modal dialog shadow from the boards. */
export const DIALOG_SHADOW = "[box-shadow:0_30px_80px_color-mix(in_srgb,black_28%,transparent)]";

/** Popover surface: 16px radius menus, 20px radius panels. */
export const POPOVER_MENU = `flex flex-col gap-0.5 rounded-[16px] bg-studio-surface p-1.5 ${POPOVER_SHADOW}`;
export const POPOVER_PANEL = `flex flex-col gap-3 rounded-[20px] bg-studio-surface p-4 text-studio-text ${POPOVER_SHADOW}`;

/** 36px menu row, 10px radius, subtle fill on hover / keyboard focus / current. */
export const MENU_ROW =
  "flex h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 text-left text-[13px] font-medium text-studio-text outline-none transition-colors hover:bg-[var(--st-sub)] focus-visible:bg-[var(--st-sub)] disabled:opacity-40";

/** Chip floating over the canvas (zoom HUD, recording timer). */
export const CANVAS_CHIP =
  "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-sm bg-studio-surface px-2.5 text-xs font-semibold tabular-nums text-studio-text shadow-studio";

type IconButtonTone = "plain" | "selected" | "primary";

export interface PreviewIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 32 | 36 | 40 | 44;
  tone?: IconButtonTone;
  children: ReactNode;
}

const TONE: Record<IconButtonTone, string> = {
  plain: "bg-transparent text-studio-text hover:bg-[var(--st-sub)]",
  selected: "bg-studio-selected text-studio-on-selected",
  primary: "bg-studio-accent text-studio-on-accent",
};

const SIZE: Record<NonNullable<PreviewIconButtonProps["size"]>, string> = {
  32: "h-8 w-8",
  36: "h-9 w-9",
  40: "h-10 w-10",
  44: "h-11 w-11",
};

/** Round icon-only button (32–44px) used across the preview card. */
export const PreviewIconButton = forwardRef<HTMLButtonElement, PreviewIconButtonProps>(
  function PreviewIconButton(
    { label, size = 36, tone = "plain", className, children, title, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={title ?? label}
        className={`inline-flex flex-none items-center justify-center rounded-full p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--st-btn)] disabled:pointer-events-none disabled:opacity-40 ${SIZE[size]} ${TONE[tone]} ${className ?? ""}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export interface OutlinePillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  height?: 30 | 32 | 36 | 40;
  selected?: boolean;
  children: ReactNode;
}

const PILL_HEIGHT: Record<NonNullable<OutlinePillProps["height"]>, string> = {
  30: "h-[30px] px-3 text-xs",
  32: "h-8 px-3 text-xs",
  36: "h-9 px-3.5 text-xs",
  40: "h-10 px-[18px] text-[13px]",
};

/** Secondary pill with the 1.5px inset outline ("Potrivește", "1×", "Șterge"). */
export const OutlinePill = forwardRef<HTMLButtonElement, OutlinePillProps>(function OutlinePill(
  { height = 30, selected = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--st-btn)] disabled:pointer-events-none disabled:opacity-40 ${PILL_HEIGHT[height]} ${
        selected
          ? "bg-studio-selected text-studio-on-selected"
          : "bg-transparent text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
      } ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/** Black (light) / steel (dark) primary pill. */
export const PrimaryPill = forwardRef<HTMLButtonElement, OutlinePillProps>(function PrimaryPill(
  { height = 40, className, children, selected: _selected, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-studio-accent font-semibold text-studio-on-accent outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--st-btn)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 ${PILL_HEIGHT[height]} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/** Keyboard key cap used by the shortcut lists. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-6 flex-none items-center justify-center whitespace-nowrap rounded-sm bg-[var(--st-sub)] px-1.5 font-sans text-[11px] font-semibold text-studio-text">
      {children}
    </kbd>
  );
}
