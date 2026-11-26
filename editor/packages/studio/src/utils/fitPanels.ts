/**
 * Panel reconciliation for the Studio shell.
 *
 * The shell is `[sidebar | preview | inspector]` over a full-width timeline.
 * Only the preview is flexible (`flex-1 min-w-0`), so without an explicit floor
 * it absorbs every squeeze: at a 560px window the old 240/320 panel floors alone
 * overflowed the viewport and the preview rendered at 2px, on a *fresh* load.
 * The same held vertically once the window was resized after mount.
 *
 * Every caller (mount, resize, drag, keyboard nudge, preference restore) routes
 * through {@link fitPanelWidths} / {@link fitTimelineHeight} so exactly one place
 * decides who yields. The rule is: the preview gets its floor first, panels
 * shrink toward their minimums, then collapse to rails.
 */

/** Smallest preview box worth editing in. Chosen, not derived — see the plan. */
export const MIN_PREVIEW_W = 360;
export const MIN_PREVIEW_H = 200;

const MIN_LEFT = 200;
const MIN_RIGHT = 280;
/** Collapsed icon rail (St-Shell-Collapsed) and the inspector rail of a narrow window (St-Shell-Narrow). */
export const RAIL_W = 40;
/** Expanded rail with labels (St-Main). */
export const EXPANDED_RAIL_W = 72;
/** Space between the shell cards, and between the cards and the window edge. */
export const SHELL_GAP = 12;
export const MIN_TIMELINE_H = 100;

/** No single panel may claim more than this share of the window. */
const PANEL_MAX_RATIO = 0.4;

/** Board widths at 1440: side panel 312, inspector 340. */
const DEFAULT_LEFT = 312;
const DEFAULT_RIGHT = 340;

/**
 * Horizontal space the shell spends outside the three resizable boxes: the two window
 * gutters, the rail with its gap, the gap before the preview (only when the side panel
 * is open) and the gap before the inspector or its rail.
 */
export function shellChromeWidth(leftRailed: boolean, rightRailed: boolean): number {
  const left = leftRailed ? RAIL_W + SHELL_GAP : EXPANDED_RAIL_W + SHELL_GAP * 2;
  const right = SHELL_GAP + (rightRailed ? RAIL_W : 0);
  return SHELL_GAP * 2 + left + right;
}

/*
 * Thresholds below are DERIVED from the minimums above, not chosen:
 *
 *   chrome 132 + MIN_LEFT 200 + MIN_PREVIEW_W 360 + MIN_RIGHT 280 = 972
 *     -> below 972 the side panel can no longer fit at its minimum.
 *   chrome 128 (railed side panel, inspector rail) + MIN_PREVIEW_W 360 + MIN_RIGHT 280 = 768
 *     -> below 768 the inspector can no longer fit either.
 *
 * Change a minimum and move the matching threshold with it.
 */
const RAIL_LEFT_BELOW = shellChromeWidth(false, false) + MIN_LEFT + MIN_PREVIEW_W + MIN_RIGHT;
const RAIL_RIGHT_BELOW = shellChromeWidth(true, true) + MIN_PREVIEW_W + MIN_RIGHT;

/**
 * True when the window is narrow enough to force at least one panel to a rail.
 * The sidebar threshold is the wider of the two, so it is the whole condition.
 */
export function railsEngaged(viewportWidth: number): boolean {
  return viewportWidth < RAIL_LEFT_BELOW;
}

export interface PanelWidths {
  left: number;
  right: number;
}

export interface FittedPanelWidths extends PanelWidths {
  preview: number;
  /**
   * Width-driven collapse. Derived per render; NEVER persisted and never written
   * back to the user's own collapse preference — `leftCollapsed` lives in
   * localStorage and `rightCollapsed` is synced into the shareable Studio URL,
   * so a ten-second window drag must not rewrite either.
   */
  autoCollapseLeft: boolean;
  autoCollapseRight: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The width each panel wants on a given viewport, before reconciliation (312 / 340 at 1440). */
export function defaultPanelWidths(viewportWidth: number): PanelWidths {
  return {
    left: clamp(Math.round((viewportWidth * DEFAULT_LEFT) / 1440), MIN_LEFT, DEFAULT_LEFT),
    right: clamp(Math.round((viewportWidth * DEFAULT_RIGHT) / 1440), MIN_RIGHT, DEFAULT_RIGHT),
  };
}

/**
 * Resolve preferred panel widths against the viewport, reserving the preview.
 *
 * Order of yielding: window-relative cap, then the inspector shrinks toward its
 * minimum, then the side panel, then rails. A railed side reports width 0: the rail
 * itself is part of {@link shellChromeWidth}. A viewport of 0 (element not measured
 * yet) returns the preferences untouched so a pre-measurement frame cannot clobber
 * a real preference.
 */
// fallow-ignore-next-line complexity
export function fitPanelWidths(
  viewportWidth: number,
  preferred: PanelWidths,
  /**
   * Sides the user explicitly reopened while the window was narrow. A side
   * listed here keeps its real width instead of the rail.
   */
  reopened: { left: boolean; right: boolean } = { left: false, right: false },
): FittedPanelWidths {
  const vw = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  if (vw <= 0) {
    return { ...preferred, preview: 0, autoCollapseLeft: false, autoCollapseRight: false };
  }

  const autoCollapseLeft = vw < RAIL_LEFT_BELOW && !reopened.left;
  const autoCollapseRight = vw < RAIL_RIGHT_BELOW && !reopened.right;
  const cap = Math.floor(vw * PANEL_MAX_RATIO);

  let left = autoCollapseLeft ? 0 : clamp(preferred.left, MIN_LEFT, Math.max(MIN_LEFT, cap));
  let right = autoCollapseRight ? 0 : clamp(preferred.right, MIN_RIGHT, Math.max(MIN_RIGHT, cap));
  const chrome = shellChromeWidth(autoCollapseLeft, autoCollapseRight);

  const budget = vw - MIN_PREVIEW_W - chrome;
  if (left + right > budget) right = autoCollapseRight ? 0 : Math.max(MIN_RIGHT, budget - left);
  if (left + right > budget) left = autoCollapseLeft ? 0 : Math.max(MIN_LEFT, budget - right);

  return {
    left,
    right,
    preview: Math.max(0, vw - left - right - chrome),
    autoCollapseLeft,
    autoCollapseRight,
  };
}

/**
 * Resolve a preferred timeline height against the shell's measured height.
 *
 * Subsumes the clamping that used to be inlined in TimelineResizeDivider's
 * pointer and keyboard handlers and duplicated (mount-only) in NLEContext.
 */
export function fitTimelineHeight(containerHeight: number, preferred: number): number {
  const h = Number.isFinite(containerHeight) ? containerHeight : 0;
  const wanted = Number.isFinite(preferred) ? preferred : MIN_TIMELINE_H;
  if (h <= 0) return Math.max(MIN_TIMELINE_H, wanted);
  return clamp(wanted, MIN_TIMELINE_H, Math.max(MIN_TIMELINE_H, h - MIN_PREVIEW_H));
}
