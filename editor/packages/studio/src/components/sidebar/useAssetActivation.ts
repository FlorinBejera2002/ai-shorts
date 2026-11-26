// Click behaviour shared by the media tile and the audio row (CapCut-style):
// an asset already on the timeline selects and reveals its clip; otherwise the
// preview overlay opens over the canvas. A pointer that moved past the drag
// threshold before pointer-up was a drag, not a click.
import { useCallback, useRef } from "react";
import { usePlayerStore } from "../../player/store/playerStore";
import { timelineClipFocusId } from "../../player/components/timelineNavigationIdentity";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { findClipForAsset, isPointerClick } from "../../utils/assetClickBehavior";

export function useAssetActivation(asset: string, used: boolean, projectId: string) {
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const setSelectedElementId = usePlayerStore((s) => s.setSelectedElementId);
  const requestTimelineFocus = usePlayerStore((s) => s.requestTimelineFocus);
  const elements = usePlayerStore((s) => s.elements);
  const setPreviewAsset = useAssetPreviewStore((s) => s.setPreviewAsset);
  const clearPreviewAsset = useAssetPreviewStore((s) => s.clearPreviewAsset);

  const activate = useCallback(() => {
    if (used) {
      const clip = findClipForAsset(elements, asset);
      if (clip) {
        // Dismiss a preview of another asset so no stale card floats over the canvas.
        clearPreviewAsset();
        const clipKey = clip.key ?? clip.id;
        setSelectedElementId(clipKey);
        requestTimelineFocus(timelineClipFocusId(clipKey));
        return;
      }
    }
    setPreviewAsset(asset, projectId);
  }, [
    used,
    elements,
    asset,
    projectId,
    setSelectedElementId,
    requestTimelineFocus,
    setPreviewAsset,
    clearPreviewAsset,
  ]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only the primary button activates; a right-click opens the actions menu instead.
    pointerDownRef.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const origin = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!origin) return;
      if (!isPointerClick(e.clientX - origin.x, e.clientY - origin.y)) return;
      activate();
    },
    [activate],
  );

  /** Enter / Space on the focused tile, ContextMenu / Shift+F10 opens the actions menu. */
  const keyHandler = useCallback(
    (openMenu: (x: number, y: number) => void) => (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
        return;
      }
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        openMenu(rect.left + 12, rect.top + 12);
      }
    },
    [activate],
  );

  return { activate, onPointerDown, onPointerUp, keyHandler };
}
