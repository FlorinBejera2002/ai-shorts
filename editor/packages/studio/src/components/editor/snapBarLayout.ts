// Layout rules for the snap bar: where it sits, how big its buttons are and when it stays
// visible without hover.
import type { CSSProperties } from "react";
import { PHONE_GRID_TOP } from "../nle/preview/phoneStageReserve";

const DESKTOP_POSITION: CSSProperties = {
  left: "max(10px, calc(50% - var(--preview-stage-w, 0px) / 2 + 10px))",
  top: "max(10px, calc(50% - var(--preview-stage-h, 0px) / 2 + 10px))",
};

export const SNAP_BAR_SIZES = {
  phone: { button: 40, icon: 18 },
  desktop: { button: 32, icon: 16 },
} as const;

export function snapBarSizes(isPhone: boolean) {
  return isPhone ? SNAP_BAR_SIZES.phone : SNAP_BAR_SIZES.desktop;
}

export function snapBarClassName(isPhone: boolean, sticky: boolean): string {
  // Phone: in the space PreviewPane reserves above the stage (snapBarStyle sets the top).
  if (isPhone) return "absolute left-1/2 z-[160] flex -translate-x-1/2 items-center gap-2";
  const hover = sticky ? "" : "opacity-0 focus-within:opacity-100 group-hover/preview:opacity-100";
  return `absolute z-50 flex flex-col items-start gap-2 transition-opacity ${hover}`;
}

export function snapBarStyle(isPhone: boolean): CSSProperties | undefined {
  return isPhone ? { top: PHONE_GRID_TOP } : DESKTOP_POSITION;
}

/** The bar stays on screen while the grid popover, grid, recording or motion path is in use. */
export function isSnapBarSticky(state: {
  gridPopoverOpen: boolean;
  gridVisible: boolean;
  recording: boolean;
  motionPathArmed: boolean;
}): boolean {
  // A selection alone does not pin the bar: St-Preview-Resize/Rotate show the selected element
  // without the bar over the stage; it still appears on hover (St-Preview-SnapBar).
  return state.gridPopoverOpen || state.gridVisible || state.recording || state.motionPathArmed;
}
