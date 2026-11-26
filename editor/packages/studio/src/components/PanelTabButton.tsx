import { Tooltip } from "./ui";

/** Tab-bar button for the right inspector panel header. */
export function PanelTabButton({
  label,
  tooltip,
  active,
  onClick,
}: {
  label: string;
  tooltip: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={tooltip} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`h-8 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors active:scale-[0.98] ${
          active
            ? "bg-studio-selected text-studio-on-selected"
            : "text-studio-muted hover:bg-panel-hover hover:text-studio-text"
        }`}
      >
        {label}
      </button>
    </Tooltip>
  );
}
