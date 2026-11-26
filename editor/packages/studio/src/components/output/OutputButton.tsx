// Pill and icon buttons sized exactly as on the output boards (heights 28 to 48, 999px radius).
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { OutputIcon, type OutputIconName } from "./OutputIcon";

export type OutputButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerFill";

const VARIANT_CLASS: Record<OutputButtonVariant, string> = {
  // Primary is black in light mode and steel with a dark label in dark mode. Never blue.
  primary: "bg-[var(--st-btn)] text-[var(--st-on-btn)] hover:opacity-90",
  secondary:
    "bg-transparent text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]",
  ghost: "bg-transparent text-studio-text hover:bg-[var(--st-sub)]",
  danger: "bg-transparent text-[var(--st-danger)] hover:bg-[var(--st-danger-bg)]",
  dangerFill: "bg-[var(--st-danger)] text-[var(--st-on-btn)] hover:opacity-90",
};

const FOCUS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]";

export interface OutputButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  variant?: OutputButtonVariant;
  /** Height in px (board values: 28, 32, 36, 40, 44, 48). */
  height?: number;
  /** Horizontal padding in px. */
  padX?: number;
  fontSize?: number;
  icon?: OutputIconName;
  iconSize?: number;
  /** Stretch to the container width (or share a row with flex-1). */
  stretch?: boolean;
  children: ReactNode;
}

export const OutputButton = forwardRef<HTMLButtonElement, OutputButtonProps>(function OutputButton(
  {
    variant = "secondary",
    height = 40,
    padX = 16,
    fontSize = 13,
    icon,
    iconSize = 16,
    stretch = false,
    className = "",
    style,
    type = "button",
    children,
    ...rest
  },
  ref,
) {
  const sizing: CSSProperties = { height, paddingLeft: padX, paddingRight: padX, fontSize };
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        stretch ? "flex-1" : "flex-none",
        VARIANT_CLASS[variant],
        FOCUS,
        className,
      ].join(" ")}
      style={{ ...sizing, ...style }}
      {...rest}
    >
      {icon ? <OutputIcon name={icon} size={iconSize} /> : null}
      {children}
    </button>
  );
});

export interface OutputIconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  icon: OutputIconName;
  label: string;
  size?: number;
  iconSize?: number;
  pressed?: boolean;
}

/** Round icon-only button (board `ibtn`). The label is both the accessible name and the tooltip. */
export function OutputIconButton({
  icon,
  label,
  size = 32,
  iconSize = 16,
  pressed,
  className = "",
  type = "button",
  ...rest
}: OutputIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={[
        "inline-flex flex-none items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        pressed
          ? "bg-[var(--st-sel)] text-[var(--st-on-sel)]"
          : "bg-transparent text-studio-text hover:bg-[var(--st-sub)]",
        FOCUS,
        className,
      ].join(" ")}
      style={{ width: size, height: size }}
      {...rest}
    >
      <OutputIcon name={icon} size={iconSize} />
    </button>
  );
}
