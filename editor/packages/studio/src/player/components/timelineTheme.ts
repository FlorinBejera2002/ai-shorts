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

// Colours come from styles/tokens.css so the timeline follows the app theme.
// Alpha overlays use color-mix() on the token, which keeps them correct in light and dark.
const mix = (token: string, percent: number) =>
  `color-mix(in srgb, var(--st-${token}) ${percent}%, transparent)`;

/** Alpha tint of a theme token, for overlays drawn inline. */
export const timelineMix = mix;

/** Primary interaction colour (black in light, steel in dark) for snap guides, drop
 *  targets and range highlights. */
export const TIMELINE_ACCENT = "var(--st-btn)";

const TRACK_STYLE: TimelineTrackStyle = {
  clip: mix("tx", 6),
  clipActive: mix("btn", 18),
  accent: "var(--st-btn)",
  label: mix("tx", 50),
};

export const defaultTimelineTheme: TimelineTheme = {
  shellBackground: "var(--st-sf)",
  shellBorder: mix("tx", 5),
  rulerBorder: mix("tx", 16),
  // Track lanes are recessed below the panel surface.
  rowBackground: "var(--st-in)",
  rowBorder: mix("tx", 6),
  gutterBackground: "var(--st-sf)",
  gutterBorder: mix("tx", 10),
  textPrimary: mix("tx", 92),
  textSecondary: mix("tx", 62),
  tickText: mix("tx", 34),
  tickMajor: mix("tx", 10),
  tickMinor: mix("tx", 6),
  clipBackground: "var(--st-sub)",
  clipBackgroundActive: `color-mix(in srgb, var(--st-btn) 18%, var(--st-sub))`,
  clipBorder: mix("tx", 10),
  clipBorderHover: mix("tx", 18),
  clipBorderActive: "var(--st-btn)",
  clipShadow: "none",
  clipShadowHover: "var(--st-sh)",
  clipShadowActive: "var(--st-sh)",
  clipShadowDragging: "var(--st-sh)",
  handleColor: mix("tx", 20),
  panelResizeSeam: mix("tx", 12),
  panelResizeActive: mix("tx", 24),
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
