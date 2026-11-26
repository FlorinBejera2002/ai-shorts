// Gesture recording for the shell: the commit hook plus the trail overlay drawn over the
// preview while recording. Extracted from App.tsx to keep it under the 600-line budget.
import { useMemo, type ReactNode } from "react";
import { GestureTrailOverlay } from "../editor/GestureTrailOverlay";
import { useGestureCommit } from "../../hooks/useGestureCommit";

type GestureCommitParams = Parameters<typeof useGestureCommit>[0];

export interface GestureLayerParams extends GestureCommitParams {
  previewIframe: HTMLIFrameElement | null;
  compositionSize: { width: number; height: number } | null;
}

export function useGestureLayer({ previewIframe, compositionSize, ...commit }: GestureLayerParams) {
  const { gestureState, gestureRecording, handleToggleRecording } = useGestureCommit(commit);
  const recording = gestureState === "recording";
  // Measured once when recording starts, like the trail itself: the canvas does not move then.
  const canvasRect = useMemo(
    () => (recording && previewIframe ? previewIframe.getBoundingClientRect() : null),
    [recording, previewIframe],
  );
  const gestureOverlay: ReactNode =
    recording && previewIframe && canvasRect ? (
      <GestureTrailOverlay
        samples={gestureRecording.samplesRef.current}
        sampleCount={gestureRecording.samplesRef.current.length}
        trail={gestureRecording.trailRef.current}
        canvasRect={canvasRect}
        compositionSize={compositionSize ?? undefined}
        mode="recording"
      />
    ) : undefined;

  return { gestureState, gestureRecording, handleToggleRecording, gestureOverlay };
}
