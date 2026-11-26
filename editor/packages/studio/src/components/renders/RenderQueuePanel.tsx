import { memo } from "react";
import { RenderQueue } from "./RenderQueue";
import type { RenderJob } from "./useRenderQueue";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { useStartRenderFromForm } from "./useStartRenderFromForm";

/**
 * The Renders tab, wired to the shell context.
 *
 * Split out of StudioRightPanel because every field it needs already lives in
 * that context, so routing them through the panel only made the panel longer
 * without giving anything a second reader. The export flow dialogs live in ExportFlowHost, at
 * shell level, so they survive the tab (and, on phone, its sheet) closing.
 */
export const RenderQueuePanel = memo(function RenderQueuePanel() {
  const { projectId, compositionDimensions, renderQueue } = useStudioShellContext();
  const startRender = useStartRenderFromForm();

  return (
    <RenderQueue
      jobs={renderQueue.jobs as RenderJob[]}
      projectId={projectId}
      onDelete={renderQueue.deleteRender}
      onCancel={renderQueue.cancelRender}
      loadError={renderQueue.loadError}
      onRetryLoad={renderQueue.reloadRenders}
      historyLoading={renderQueue.historyLoading}
      hiddenCount={renderQueue.hiddenCount}
      hideableCount={renderQueue.hideableCount}
      onShowHidden={renderQueue.restoreHiddenRenders}
      actionError={renderQueue.actionError}
      onDismissActionError={renderQueue.dismissActionError}
      onClearCompleted={renderQueue.clearCompleted}
      ffmpeg={renderQueue.ffmpeg}
      ffmpegChecking={renderQueue.ffmpegChecking}
      onRecheckFfmpeg={renderQueue.recheckFfmpeg}
      onStartRender={startRender}
      compositionDimensions={compositionDimensions}
      isRendering={renderQueue.isRendering}
    />
  );
});
