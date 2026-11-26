// Undo and redo for the top bar. The tooltip names the action ("Anulează Mută clipul (⌘Z)").
import { useStudioShellContext } from "../../contexts/StudioContext";
import { t, useLocale } from "../../i18n/translate";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { Tooltip } from "../ui";
import { ShellIcon } from "./ShellIcon";
import { historyTooltip, type HistoryDirection, SHELL_ICON_BUTTON } from "./shellButtons";
import { useSaveStatus } from "./saveStatus";

export { historyTooltip, SHELL_ICON_BUTTON, shellToggleButton } from "./shellButtons";

export function HistoryButtons({ size }: { size: "desktop" | "phone" }) {
  useLocale();
  const { editHistory, handleUndo, handleRedo } = useStudioShellContext();
  // A multi-file write (format change) takes seconds; undoing halfway would mix two states.
  const saving = useSaveStatus(false) === "saving";
  const box = size === "phone" ? "h-11 w-11" : "h-9 w-9";
  const buttons: Array<{
    direction: HistoryDirection;
    enabled: boolean;
    label: string | null | undefined;
    run: () => unknown;
  }> = [
    {
      direction: "undo",
      enabled: editHistory.canUndo && !saving,
      label: editHistory.undoLabel,
      run: handleUndo,
    },
    {
      direction: "redo",
      enabled: editHistory.canRedo && !saving,
      label: editHistory.redoLabel,
      run: handleRedo,
    },
  ];
  return (
    <span className="flex flex-none gap-0.5">
      {buttons.map(({ direction, enabled, label, run }) => (
        <Tooltip key={direction} label={historyTooltip(direction, label)} side="bottom">
          <button
            type="button"
            aria-label={t(direction === "undo" ? "shell.undo" : "shell.redo")}
            disabled={!enabled}
            onClick={() => {
              trackStudioEvent("toolbar_action", { action: direction });
              void run();
            }}
            className={`${SHELL_ICON_BUTTON} ${box}`}
          >
            <ShellIcon name={direction} />
          </button>
        </Tooltip>
      ))}
    </span>
  );
}
