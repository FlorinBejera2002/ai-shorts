// Inspector toggle and Export, shared by the desktop top bar and the phone top bar.
import { usePanelLayoutContext } from "../../contexts/PanelLayoutContext";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { t } from "../../i18n/translate";
import { trackStudioEvent } from "../../utils/studioTelemetry";

/**
 * Does the Inspector button open the panel, or close it?
 *
 * Takes the EFFECTIVE collapse state, so a panel the window has railed away
 * counts as closed even though the user's stored intent still says open. The
 * argument name is the guard: passing raw intent here is the bug this exists
 * to keep out.
 */
export function shouldOpenInspector(
  effectiveRightCollapsed: boolean,
  inspectorPanelActive: boolean,
): boolean {
  return effectiveRightCollapsed || !inspectorPanelActive;
}

export function useShellActions(inspectorPanelActive: boolean, onExport?: () => void) {
  const { renderQueue } = useStudioShellContext();
  // effectiveRightCollapsed, not the raw intent: in the auto-railed state the
  // intent is still "open" while the panel is hidden, so branching on intent
  // made this button write rightCollapsed=true — and that value is synced into
  // the shareable Studio URL, so a dead click would rewrite a link.
  const { effectiveRightCollapsed, setRightCollapsed, setRightPanelTab } = usePanelLayoutContext();
  const isRendering = renderQueue.isRendering;
  const ffmpegMissing = renderQueue.ffmpegMissing;

  const toggleInspector = () => {
    if (shouldOpenInspector(effectiveRightCollapsed, inspectorPanelActive)) {
      trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: false });
      setRightPanelTab("design");
      setRightCollapsed(false);
      return;
    }
    trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: true });
    // Keep the current selection when collapsing the Inspector: closing the
    // panel shouldn't deselect the element.
    setRightCollapsed(true);
  };

  const startExport = () => {
    if (isRendering) return;
    setRightPanelTab("renders");
    setRightCollapsed(false);
    // Without an encoder this render cannot finish, so the click delivers the
    // user to the prompt that fixes it instead of queueing a job that exists
    // only to fail.
    if (ffmpegMissing) return;
    onExport?.();
  };

  const exportTooltip = ffmpegMissing
    ? t("shell.exportFfmpegTip")
    : isRendering
      ? t("shell.exportBusyTip")
      : t("shell.exportTip");

  return { toggleInspector, startExport, exportTooltip, isRendering };
}
