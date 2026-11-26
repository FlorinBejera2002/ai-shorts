type Box = { left: number; top: number; width: number; height: number };

/** Where a fully off-canvas element sits relative to the frame, or null when it overlaps. */
export function offCanvasSide(rect: Box, comp: Box): "top" | "bottom" | "left" | "right" | null {
  if (rect.top + rect.height <= comp.top) return "top";
  if (rect.top >= comp.top + comp.height) return "bottom";
  if (rect.left + rect.width <= comp.left) return "left";
  if (rect.left >= comp.left + comp.width) return "right";
  return null;
}
