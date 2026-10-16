import type { GestureState, UseDomEditOverlayGesturesOptions } from "./domEditOverlayGestures";
import { readElementGsapNumber } from "../../utils/elementGsap";
import { rebaseTextResize } from "./manualTextResize";

export function pinchGeometry(points: Iterable<{ x: number; y: number }>) {
  const [first, second] = [...points];
  if (!first || !second) return null;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
  };
}

/** Upgrade the active touch drag without creating another save/undo transaction. */
export function addPinchPointer(
  event: React.PointerEvent<HTMLElement>,
  opts: UseDomEditOverlayGesturesOptions,
): boolean {
  const gesture = opts.gestureRef.current;
  if (
    event.pointerType !== "touch" ||
    !gesture?.touchPoints ||
    !gesture.selection.capabilities.canApplyManualSize
  )
    return false;
  if (gesture.touchPoints.has(event.pointerId)) return false;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
  if (gesture.touchPoints.size >= 2) return true;
  gesture.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const geometry = pinchGeometry(gesture.touchPoints.values());
  if (!geometry || geometry.distance < 1) return true;
  rebaseTextResize(gesture.selection.element, gesture.actualWidth);
  gesture.kind = "resize";
  gesture.mode = "box-size";
  const bounds = gesture.selection.element.getBoundingClientRect();
  gesture.resizeAnchor = {
    anchorX: bounds.x,
    anchorY: bounds.y,
    baseGsapX: readElementGsapNumber(gesture.selection.element, "x") ?? 0,
    baseGsapY: readElementGsapNumber(gesture.selection.element, "y") ?? 0,
    pinX: 0,
    pinY: 0,
  };
  gesture.pinch = {
    ...geometry,
    offsetX: gesture.lastSnappedDx ?? 0,
    offsetY: gesture.lastSnappedDy ?? 0,
    changed: false,
  };
  gesture.lastResizeAnchor = { dx: gesture.pinch.offsetX, dy: gesture.pinch.offsetY };
  return true;
}

export function resolvePinchDraft(gesture: GestureState) {
  const pinch = gesture.pinch;
  const current = gesture.touchPoints && pinchGeometry(gesture.touchPoints.values());
  if (!pinch || !current) return null;
  const scale = Math.max(0.05, Math.min(20, current.distance / pinch.distance));
  const dx = pinch.offsetX + current.centerX - pinch.centerX;
  const dy = pinch.offsetY + current.centerY - pinch.centerY;
  pinch.changed ||= Math.abs(current.distance - pinch.distance) >= 2 || Math.hypot(dx, dy) >= 2;
  gesture.resizeFixedCenterStart = {
    x: gesture.originLeft + gesture.originWidth / 2 + dx,
    y: gesture.originTop + gesture.originHeight / 2 + dy,
  };
  return { width: gesture.actualWidth * scale, height: gesture.actualHeight * scale };
}
