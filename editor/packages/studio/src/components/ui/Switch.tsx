// On/off switch. Track and thumb are fully rounded; the on state uses the primary token.
export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-studio-accent" : "bg-[var(--st-hd)]",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "block h-5 w-5 rounded-full bg-studio-surface shadow-studio transition-transform",
          checked ? "translate-x-[22px] bg-studio-on-accent" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}
