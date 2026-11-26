// Buttons of the Ana și Radu panel, sized as on the boards: pills (32 / 36 / 44 tall) and round
// icon buttons. Primary is --st-btn (black in light, steel in dark); never blue.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { AgentIcon, type AgentIconName } from "./AgentIcon";

export type AgentPillVariant = "primary" | "secondary" | "ghost" | "danger";

const PILL_VARIANT: Record<AgentPillVariant, string> = {
  primary: "bg-[var(--st-btn)] text-[var(--st-on-btn)] hover:opacity-90",
  secondary:
    "bg-transparent text-[var(--st-tx)] shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]",
  ghost: "bg-transparent text-[var(--st-tx)] hover:bg-[var(--st-sub)]",
  danger: "bg-[var(--st-danger)] text-[var(--st-sf)] hover:opacity-90",
};

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]";

export interface AgentPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AgentPillVariant;
  /** Height in px: 32 (suggestions), 36 (desktop run actions), 44 (phone). */
  height?: 32 | 36 | 40 | 44;
  icon?: AgentIconName;
  fill?: boolean;
}

const HEIGHT: Record<NonNullable<AgentPillProps["height"]>, string> = {
  32: "h-8 px-3.5",
  36: "h-9 px-4",
  40: "h-10 px-4",
  44: "h-11 px-4",
};

export function AgentPill({
  variant = "secondary",
  height = 36,
  icon,
  fill,
  className = "",
  type = "button",
  children,
  ...rest
}: AgentPillProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        fill ? "flex-1 basis-0" : "flex-none",
        HEIGHT[height],
        PILL_VARIANT[variant],
        FOCUS,
        className,
      ].join(" ")}
      {...rest}
    >
      {icon ? <AgentIcon name={icon} size={15} /> : null}
      {children}
    </button>
  );
}

export interface AgentIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: AgentIconName;
  label: string;
  size?: 28 | 32 | 36 | 44;
  iconSize?: number;
  primary?: boolean;
  pressed?: boolean;
}

const SQUARE: Record<NonNullable<AgentIconButtonProps["size"]>, string> = {
  28: "h-7 w-7",
  32: "h-8 w-8",
  36: "h-9 w-9",
  44: "h-11 w-11",
};

export const AgentIconButton = forwardRef<HTMLButtonElement, AgentIconButtonProps>(
  function AgentIconButton(
    { icon, label, size = 36, iconSize = 18, primary, pressed, className = "", ...rest },
    ref,
  ) {
    const tone = primary
      ? "bg-[var(--st-btn)] text-[var(--st-on-btn)] disabled:opacity-40"
      : pressed
        ? "bg-[var(--st-sel)] text-[var(--st-on-sel)]"
        : "bg-transparent text-[var(--st-tx)] hover:bg-[var(--st-sub)] disabled:opacity-40";
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`inline-flex flex-none items-center justify-center rounded-full disabled:cursor-not-allowed ${SQUARE[size]} ${tone} ${FOCUS} ${className}`}
        {...rest}
      >
        <AgentIcon name={icon} size={iconSize} />
      </button>
    );
  },
);
