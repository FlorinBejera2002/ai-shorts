import { t } from "../../i18n/translate";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { OverlayRect } from "./domEditOverlayGeometry";

/** Rotate handle below the selection: an attached circular-arrows icon chip
 *  (no connecting stem). Anchors to the crop outline when the element is
 *  cropped so it stays next to what's visible on screen. Presentation only —
 *  the rotation gesture measures pointer angles from the element CENTER
 *  (resolveDomEditRotationGesture), so the handle position doesn't affect the
 *  math. Sits 12px below the bbox, past the bottom crop handle's hit strip. */
export function DomEditRotateHandle({
  overlayRect,
  cropOutlineInsetPx,
  onStartRotate,
}: {
  overlayRect: OverlayRect;
  cropOutlineInsetPx?: { top: number; right: number; bottom: number; left: number };
  onStartRotate: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const inset = cropOutlineInsetPx ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const visibleLeft = overlayRect.left + inset.left;
  const visibleWidth = Math.max(0, overlayRect.width - inset.left - inset.right);
  const visibleBottom = overlayRect.top + overlayRect.height - inset.bottom;
  return (
    <button
      type="button"
      className="pointer-events-auto absolute flex items-center justify-center border-0 bg-transparent p-0"
      style={{
        left: visibleLeft + visibleWidth / 2,
        top: visibleBottom + 12,
        width: 28,
        height: 28,
        transform: "translateX(-50%)",
        touchAction: "none",
        // Closed-hand grab cursor: this handle is grabbed and dragged to rotate.
        cursor: "grabbing",
      }}
      title={t("preview.rotateSelection")}
      aria-label={t("preview.rotateSelection")}
      onPointerDown={onStartRotate}
    >
      <span className="pointer-events-none flex h-7 w-7 items-center justify-center rounded-full bg-studio-surface text-studio-text shadow-studio">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      </span>
    </button>
  );
}
