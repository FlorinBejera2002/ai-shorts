// The layers icon that copies one setting to every cut (St-Inspector-CutApply). Rows show it
// on hover and keyboard focus so the resting inspector keeps the board's calm look.
const LAYERS_PATH = "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5";

export function ApplyAllIconButton({
  label,
  disabled,
  alwaysVisible = false,
  marker,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  alwaysVisible?: boolean;
  /** Identifies the button to a field whose blur save it replaces. */
  marker?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-apply-all-marker={marker}
      // Keep focus on the field so its blur does not save the single cut first.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={[
        "-my-1.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-studio-text transition-opacity",
        "hover:bg-[var(--st-sub)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        alwaysVisible ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      ].join(" ")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={LAYERS_PATH} />
      </svg>
    </button>
  );
}
