import { useStudioShellContext } from "../../contexts/StudioContext";
import { usePreviewVariablesStore } from "../../hooks/previewVariablesStore";
import type { StartRenderHandler } from "./RenderExportForm";

/**
 * Starts a render from the export form's choices, after pending edits are saved. Used by the
 * Renders tab and by the header's Export settings dialog (which follows it with the export
 * dialogs).
 */
export function useStartRenderFromForm(showExportFlow = false): StartRenderHandler {
  const { waitForPendingDomEditSaves, renderQueue } = useStudioShellContext();
  return async (format, quality, resolution, fps, hdrMode) => {
    await waitForPendingDomEditSaves();
    // No `composition`: startRender targets the active one by default.
    await renderQueue.startRender({
      fps,
      quality,
      format,
      resolution,
      hdrMode,
      // Render what the user is previewing: active variable overrides
      // from the Variables panel ride along (undefined = defaults).
      variables: usePreviewVariablesStore.getState().values ?? undefined,
      showExportFlow,
    });
  };
}
