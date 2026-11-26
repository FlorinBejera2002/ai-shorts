/** Space kept between the range prompt and the timeline card, and from the window edges. */
export const RANGE_POPOVER_GAP = 8;

export interface RangePopoverPlacementInput {
  /** Viewport x of the selected range's left and right edges. */
  rangeLeft: number;
  rangeRight: number;
  /** Viewport y the popover must stay above (the timeline card's top edge). */
  anchorTop: number;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
}

/**
 * St-Timeline-Range: the prompt floats above the timeline, centred on the selected
 * range and clamped to the window, so it never covers the toolbar, lanes or the range.
 */
export function getRangePopoverPosition(input: RangePopoverPlacementInput): {
  left: number;
  top: number;
} {
  const centre = (input.rangeLeft + input.rangeRight) / 2;
  const maxLeft = input.viewportWidth - input.popoverWidth - RANGE_POPOVER_GAP;
  const left = Math.max(RANGE_POPOVER_GAP, Math.min(centre - input.popoverWidth / 2, maxLeft));
  const top = Math.max(
    RANGE_POPOVER_GAP,
    input.anchorTop - RANGE_POPOVER_GAP - input.popoverHeight,
  );
  return { left, top };
}

/** Measures the live range highlight and timeline card, falling back to the pointer anchor. */
export function measureRangePopoverAnchor(
  popover: HTMLElement,
  fallback: { x: number; y: number },
): RangePopoverPlacementInput {
  const doc = popover.ownerDocument;
  const range = doc.querySelector("[data-timeline-range-highlight]")?.getBoundingClientRect();
  const card = (
    doc.querySelector("[data-timeline-card]") ??
    doc.querySelector("[data-timeline-scroll-viewport]")
  )?.getBoundingClientRect();
  const rect = popover.getBoundingClientRect();
  return {
    rangeLeft: range && range.width > 0 ? range.left : fallback.x,
    rangeRight: range && range.width > 0 ? range.right : fallback.x,
    anchorTop: card ? card.top : fallback.y,
    popoverWidth: rect.width,
    popoverHeight: rect.height,
    viewportWidth: doc.defaultView?.innerWidth ?? window.innerWidth,
  };
}
