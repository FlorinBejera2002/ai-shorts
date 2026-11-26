// Form pieces shared by the output boards: titled section, 14px select field, pill segment,
// text field and an inline alert. Sizes follow st.js `section`, `selectField` and `seg`.
import type { ReactNode, Ref, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { OutputIcon, type OutputIconName } from "./OutputIcon";
import { OutputIconButton } from "./OutputButton";

const FOCUS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]";

/** Section with a 13px semibold title and an optional control on the right (board `section`). */
export function OutputSection({
  title,
  right,
  children,
  labelFor,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  labelFor?: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        {labelFor ? (
          <label htmlFor={labelFor} className="text-[13px] font-semibold text-studio-text">
            {title}
          </label>
        ) : (
          <b className="text-[13px] font-semibold text-studio-text">{title}</b>
        )}
        {right}
      </div>
      {children}
    </section>
  );
}

export interface OutputSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  height?: number;
}

/** Native select drawn as the board's select field: 14px radius, inset border, chevron. */
export function OutputSelect({
  height = 40,
  className = "",
  children,
  ...rest
}: OutputSelectProps) {
  return (
    <span className={`relative flex min-w-0 ${className}`}>
      <select
        {...rest}
        className={`w-full min-w-0 cursor-pointer appearance-none truncate rounded-[14px] border-0 bg-studio-surface pr-9 pl-3.5 text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] transition-colors hover:bg-[var(--st-sub)] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
        style={{ height }}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-studio-text">
        <OutputIcon name="chevronDown" size={14} />
      </span>
    </span>
  );
}

export interface OutputSegmentOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

/** Pill segment (board `seg`): one selected option, stretched when `full`. */
export function OutputSegment<T extends string>({
  label,
  options,
  value,
  onChange,
  height = 34,
  fontSize = 13,
  padX = 12,
  full = true,
  disabled = false,
}: {
  label: string;
  options: readonly OutputSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  height?: number;
  fontSize?: number;
  padX?: number;
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${full ? "flex" : "inline-flex"} gap-0.5 rounded-full bg-studio-surface p-[3px] shadow-[inset_0_0_0_1px_var(--st-bd)] ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`${full ? "min-w-0 flex-1" : "flex-none"} truncate whitespace-nowrap rounded-full transition-colors ${FOCUS} ${
              selected
                ? "bg-[var(--st-sel)] font-semibold text-[var(--st-on-sel)]"
                : "font-medium text-[var(--st-t2)] hover:bg-[var(--st-sub)] hover:text-studio-text"
            }`}
            style={{ height, fontSize, paddingLeft: padX, paddingRight: padX }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Text field: 14px radius, inset border (1.5px danger when invalid). */
export function OutputInput({
  height = 40,
  invalid = false,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  height?: number;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`w-full min-w-0 rounded-[14px] border-0 bg-studio-surface px-3 text-[13px] text-studio-text outline-none placeholder:text-[var(--st-t3)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)] ${
        invalid
          ? "shadow-[inset_0_0_0_1.5px_var(--st-danger)]"
          : "shadow-[inset_0_0_0_1px_var(--st-sbd)]"
      } ${className}`}
      style={{ height }}
    />
  );
}

/** Inline alert card (board covOutNotice / covAlertCard) with an optional close button. */
export function OutputNotice({
  children,
  icon = "warn",
  onDismiss,
  dismissLabel,
}: {
  children: ReactNode;
  icon?: OutputIconName;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-[14px] bg-[var(--st-danger-bg)] py-2.5 pr-2 pl-3"
    >
      <span className="mt-px flex-none text-[var(--st-danger)]">
        <OutputIcon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1 text-[13px] font-semibold leading-[18px] text-studio-text">
        {children}
      </span>
      {onDismiss && dismissLabel ? (
        <OutputIconButton
          icon="close"
          label={dismissLabel}
          size={28}
          iconSize={14}
          onClick={onDismiss}
        />
      ) : null}
    </div>
  );
}

/** Alert card with a red warning dot, a bold message and actions (reconnect, conflict). */
export function OutputAlertCard({
  message,
  children,
  className = "",
}: {
  message: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={`flex w-full flex-col gap-3 rounded-[20px] bg-studio-surface p-4 text-studio-text shadow-[var(--st-sh),inset_0_0_0_1px_var(--st-bd)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--st-danger-bg)] text-[var(--st-danger)]"
        >
          <OutputIcon name="warn" size={16} strokeWidth={2.4} />
        </span>
        <b className="min-w-0 flex-1 text-sm font-semibold leading-5 [text-wrap:balance]">
          {message}
        </b>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </section>
  );
}
