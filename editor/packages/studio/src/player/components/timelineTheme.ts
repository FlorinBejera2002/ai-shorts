import type { TimelineElement } from "../store/playerStore";

export interface TimelineTrackStyle {
  clip: string;
  accent: string;
  label: string;
  clipActive?: string;
}

export interface TimelineTheme {
  shellBackground: string;
  shellBorder: string;
  rulerBorder: string;
  rowBackground: string;
  rowBorder: string;
  gutterBackground: string;
  gutterBorder: string;
  textPrimary: string;
  textSecondary: string;
  tickText: string;
  tickMajor: string;
  tickMinor: string;
  clipBackground: string;
  clipBackgroundActive: string;
  clipBorder: string;
  clipBorderHover: string;
  clipBorderActive: string;
  clipShadow: string;
  clipShadowHover: string;
  clipShadowActive: string;
  clipShadowDragging: string;
  handleColor: string;
  panelResizeSeam: string;
  panelResizeActive: string;
  clipRadius: string;
}

const TRACK_STYLE: TimelineTrackStyle = {
  clip: "rgba(255,255,255,0.055)",
  clipActive: "rgba(91,140,255,0.18)",
  accent: "#5B8CFF",
  label: "rgba(255,255,255,0.5)",
};

export const defaultTimelineTheme: TimelineTheme = {
  // Reference canvas navy: panel cards (#121A27) on the darker app canvas (#0B111C).
  shellBackground: "#121A27",
  shellBorder: "rgba(255,255,255,0.05)",
  rulerBorder: "rgba(255,255,255,0.16)",
  // Track lanes are one step lighter than the panel surface so they read distinct.
  rowBackground: "#151E2D",
  rowBorder: "rgba(255,255,255,0.06)",
  gutterBackground: "#121A27",
  gutterBorder: "rgba(255,255,255,0.10)",
  textPrimary: "rgba(255,255,255,0.92)",
  textSecondary: "rgba(255,255,255,0.62)",
  tickText: "rgba(255,255,255,0.34)",
  tickMajor: "rgba(255,255,255,0.10)",
  tickMinor: "rgba(255,255,255,0.06)",
  clipBackground: "#1C2A44",
  clipBackgroundActive: "#22355A",
  clipBorder: "rgba(255,255,255,0.10)",
  clipBorderHover: "rgba(255,255,255,0.18)",
  clipBorderActive: "#5B8CFF",
  clipShadow: "none",
  clipShadowHover: "0 2px 8px rgba(0,0,0,0.2)",
  clipShadowActive: "0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)",
  clipShadowDragging: "0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
  handleColor: "rgba(255,255,255,0.2)",
  panelResizeSeam: "rgba(255,255,255,0.12)",
  panelResizeActive: "rgba(255,255,255,0.24)",
  clipRadius: "10px",
};

export function getTimelineTrackStyle(_tag: string): TimelineTrackStyle {
  return TRACK_STYLE;
}

export function getClipHandleOpacity({
  isHovered,
  isSelected,
  isDragging,
}: {
  isHovered: boolean;
  isSelected: boolean;
  isDragging: boolean;
}): number {
  if (isDragging) return 0.95;
  if (isSelected) return 0.82;
  if (isHovered) return 0.76;
  return 0;
}

export function getRenderedTimelineElement({
  element,
  draggedElementId,
  previewStart,
  previewTrack,
}: {
  element: TimelineElement;
  draggedElementId: string | null;
  previewStart: number | null;
  previewTrack: number | null;
}): TimelineElement {
  if (
    (element.key ?? element.id) !== draggedElementId ||
    previewStart === null ||
    previewTrack === null
  ) {
    return element;
  }
  return {
    ...element,
    start: previewStart,
    track: previewTrack,
  };
}
