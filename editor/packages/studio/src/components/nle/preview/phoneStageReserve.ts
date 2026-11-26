// Space the phone preview keeps free above the stage for chrome that must not cover the video:
// the caption sync error card (St-M-Preview-CaptionSync) and the magnet/grid bar
// (St-M-Preview-Grid). PreviewPane inserts a spacer of this height above the stage surface, and
// the chrome positions itself in that spacer with a negative top offset.
import { useCaptionStore } from "../../../captions/store";
import { usePreviewPanel } from "./previewUiStore";

/** Sync error card: 8px top padding, 52px card, 12px gap to the stage. */
export const PHONE_SYNC_RESERVE = 72;
/** Offset of the sync error card from the stage surface top (inside the reserved space). */
export const PHONE_SYNC_TOP = -64;
/** Snap bar: 40px buttons plus the 12px gap to the stage; the frame's 6px padding sits above. */
export const PHONE_GRID_RESERVE = 58;
/** Offset of the snap bar from the stage surface top (6px below the reserved space start). */
export const PHONE_GRID_TOP = -52;

export function phoneStageReserve(state: { syncErrorShown: boolean; gridOpen: boolean }): number {
  if (state.syncErrorShown) return PHONE_SYNC_RESERVE;
  if (state.gridOpen) return PHONE_GRID_RESERVE;
  return 0;
}

/** Height to reserve above the phone stage right now (0 when nothing needs it). */
export function usePhoneStageReserve(): number {
  const syncErrorShown = useCaptionStore((s) => s.isEditMode && Boolean(s.syncError));
  const gridOpen = usePreviewPanel() === "phoneGrid";
  return phoneStageReserve({ syncErrorShown, gridOpen });
}
