// Shared look of the timeline's context menus (St-ClipMenu, St-Timeline-ClipMenu, -KeyMenu,
// -Gaps, -AutoMenu): a 16px card with 36px rows on desktop, and a bottom sheet with 48px rows
// on a phone (St-M-Timeline-ClipMenu). Behaviour (dismiss, keyboard) stays with each menu.
import { forwardRef, type ReactNode, type PointerEventHandler, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { TimelineIcon, type TimelineIconName } from "./TimelineIcon";
import { useIsPhone } from "../../components/shell/useIsPhone";
import { t } from "../../i18n/translate";

interface TimelineMenuSurfaceProps {
  label?: string;
  /** Pointer position the menu opened at (desktop). */
  x: number;
  y: number;
  width?: number;
  /** Rough height used to flip the menu up near the bottom edge. */
  estimatedHeight: number;
  /** Phone sheet title; falls back to the label. */
  title?: string;
  role?: string;
  /** Extra class on the menu root (tests and outside-click checks find menus by it). */
  className?: string;
  /** Phone sheet "Gata" button. */
  onDismiss?: () => void;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export const TimelineMenuSurface = forwardRef<HTMLDivElement, TimelineMenuSurfaceProps>(
  function TimelineMenuSurface(
    {
      label,
      x,
      y,
      width = 240,
      estimatedHeight,
      title,
      role = "menu",
      className = "",
      onDismiss,
      onPointerLeave,
      children,
    },
    ref,
  ) {
    const phone = useIsPhone();
    if (phone) {
      return createPortal(
        <div className="fixed inset-0 z-[200] flex items-end bg-[var(--st-ov)]">
          <div
            ref={ref}
            role={role}
            aria-label={label}
            data-timeline-menu="sheet"
            onPointerLeave={onPointerLeave}
            className={`flex max-h-[80dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-sheet bg-studio-surface px-4 pb-5 pt-2.5 ${className}`}
          >
            <span
              aria-hidden="true"
              className="mx-auto block h-1 w-10 flex-none rounded-full bg-[var(--st-hd)]"
            />
            <div className="flex flex-none items-center gap-2">
              <h2 className="flex-1 font-display text-[17px] font-semibold leading-6 text-studio-text">
                {title ?? label}
              </h2>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="h-11 flex-none rounded-full bg-[var(--st-btn)] px-[18px] text-[13px] font-semibold text-[var(--st-on-btn)]"
                >
                  {t("common.done")}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">{children}</div>
          </div>
        </div>,
        document.body,
      );
    }
    const overflowY = y + estimatedHeight - window.innerHeight;
    const left = x + width > window.innerWidth ? Math.max(8, x - width) : x;
    const top = Math.max(8, overflowY > 0 ? y - overflowY - 8 : y);
    const style: CSSProperties = {
      left,
      top,
      width,
      maxHeight: `calc(100vh - ${top + 8}px)`,
      boxShadow: "var(--st-sh), 0 16px 40px color-mix(in srgb, var(--st-tx) 16%, transparent)",
    };
    return createPortal(
      <div
        ref={ref}
        role={role}
        aria-label={label}
        data-timeline-menu="popup"
        onPointerLeave={onPointerLeave}
        className={`fixed z-[200] flex flex-col gap-0.5 overflow-y-auto rounded-[16px] bg-studio-surface p-1.5 ${className}`}
        style={style}
      >
        {children}
      </div>,
      document.body,
    );
  },
);

interface TimelineMenuItemProps {
  icon?: TimelineIconName;
  children: ReactNode;
  /** Right-hand hint: a key, a value or the current ease. */
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  /** Highlighted row (copied state). */
  active?: boolean;
  role?: string;
  onClick?: () => void;
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>;
}

export function TimelineMenuItem({
  icon,
  children,
  hint,
  danger = false,
  disabled = false,
  title,
  active = false,
  role = "menuitem",
  onClick,
  onPointerEnter,
}: TimelineMenuItemProps) {
  return (
    <button
      type="button"
      role={role}
      disabled={disabled}
      title={title}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      className={`flex min-h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 text-left text-[13px] font-medium outline-none max-sm:min-h-12 max-sm:rounded-[14px] max-sm:px-3.5 max-sm:text-sm ${
        danger ? "text-[var(--st-danger)]" : "text-[var(--st-tx)]"
      } ${active ? "bg-[var(--st-sub)]" : "bg-transparent"} ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:bg-[var(--st-sub)] focus-visible:bg-[var(--st-sub)]"
      }`}
    >
      {icon && <TimelineIcon name={icon} size={16} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint != null && <span className="flex-none text-xs text-[var(--st-t3)]">{hint}</span>}
    </button>
  );
}
