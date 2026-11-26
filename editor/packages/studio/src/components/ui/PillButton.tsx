import { forwardRef, type ButtonHTMLAttributes } from "react";

export type PillButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type PillButtonSize = "md" | "sm";

const VARIANT_CLASS: Record<PillButtonVariant, string> = {
  // Primary is black in light mode and steel in dark mode (token --st-btn). Never blue.
  primary: "bg-studio-accent text-studio-on-accent font-semibold hover:opacity-90",
  secondary:
    "bg-transparent text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]",
  ghost: "bg-transparent text-studio-text hover:bg-[var(--st-sub)]",
  danger: "bg-transparent text-studio-danger hover:bg-[var(--st-danger-bg)]",
};

// Touch target: md is 44px (phone minimum), sm is 36px for dense desktop rows.
const SIZE_CLASS: Record<PillButtonSize, string> = {
  md: "h-11 px-5 text-sm",
  sm: "h-9 px-3.5 text-xs",
};

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillButtonVariant;
  size?: PillButtonSize;
}

/** Pill action button (radius 999px). Use for dialog actions, toolbars and segments' neighbours. */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { variant = "secondary", size = "md", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      ].join(" ")}
      {...rest}
    />
  );
});
