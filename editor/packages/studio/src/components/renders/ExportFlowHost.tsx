// Mounts the export flow dialogs (St-Rendering, St-Exported, St-ExportFailed) at shell level,
// so they outlive the Renders tab. On phone the header's Export opens the inspector sheet on
// Renders; the flow closes that sheet while it shows (St-M-Exported has a single sheet) and
// "Toate exporturile" brings the Renders sheet back.
import { useEffect, useRef } from "react";
import { usePanelLayoutContext } from "../../contexts/PanelLayoutContext";
import { useStudioShellContext, useStudioShellContextOptional } from "../../contexts/StudioContext";
import { usePlayerStore } from "../../player";
import { useIsPhone } from "../shell/useIsPhone";
import { ExportFlowDialogs } from "./ExportFlowDialogs";

/** Renders nothing outside the Studio shell (the session tests mount the header bits alone). */
export function ExportFlowHost() {
  return useStudioShellContextOptional() ? <ConnectedExportFlow /> : null;
}

function ConnectedExportFlow() {
  const { projectId, compositionDimensions, waitForPendingDomEditSaves, renderQueue } =
    useStudioShellContext();
  const { setRightCollapsed, setRightPanelTab } = usePanelLayoutContext();
  const duration = usePlayerStore((state) => state.duration);
  const isPhone = useIsPhone();
  const job = renderQueue.exportFlowJob ?? null;
  const shownJobId = useRef<string | null>(null);

  useEffect(() => {
    const id = job?.id ?? null;
    if (id === shownJobId.current) return;
    shownJobId.current = id;
    if (id && isPhone) setRightCollapsed(true);
  }, [job?.id, isPhone, setRightCollapsed]);

  return (
    <ExportFlowDialogs
      compositionDimensions={compositionDimensions}
      durationSeconds={duration}
      job={job}
      projectId={projectId}
      onDismiss={() => renderQueue.dismissExportFlow?.()}
      onShowAll={() => {
        renderQueue.dismissExportFlow?.();
        setRightPanelTab("renders");
        setRightCollapsed(false);
      }}
      onCancel={renderQueue.cancelRender}
      onRetry={() => {
        void waitForPendingDomEditSaves().then(() => renderQueue.startRender(undefined));
      }}
    />
  );
}
