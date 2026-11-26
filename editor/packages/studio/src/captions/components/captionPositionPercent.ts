// St-Captions shows a word's position as a percentage of the frame (X 50%, Y 74%), while the
// caption style stores X / Y as pixel offsets from where the word sits by default. The base
// position is read once from the preview DOM; without it the frame centre is assumed.
import { useEffect, useState, type RefObject } from "react";
import { useLatestRef } from "../../hooks/useLatestRef";
import type { CaptionModel } from "../types";
import { resolveSelectedWordElements } from "./captionIframeStyle";

export interface CaptionBasePercent {
  x: number;
  y: number;
}

const FRAME_CENTRE: CaptionBasePercent = { x: 50, y: 50 };

/** Where the word would sit without its offset, in percent of the composition frame. */
export function readCaptionBasePercent(
  iframe: HTMLIFrameElement | null,
  model: CaptionModel,
  segmentId: string,
  offset: { x: number; y: number },
): CaptionBasePercent | null {
  let doc: Document | null = null;
  try {
    doc = iframe?.contentDocument ?? null;
  } catch {
    return null;
  }
  if (!doc) return null;
  const root = doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.body;
  const word = resolveSelectedWordElements(
    doc.querySelectorAll<HTMLElement>(".caption-group"),
    model,
    new Set([segmentId]),
  )[0];
  const frame = root?.getBoundingClientRect();
  const box = word?.getBoundingClientRect();
  if (!frame || !box || frame.width <= 0 || frame.height <= 0 || box.width <= 0) return null;
  const scale = frame.width / model.width;
  const centreX = (box.left + box.width / 2 - frame.left) / scale - offset.x;
  const centreY = (box.top + box.height / 2 - frame.top) / scale - offset.y;
  return { x: (centreX / model.width) * 100, y: (centreY / model.height) * 100 };
}

/** Formats a pixel offset as the frame percentage the board shows. */
export function formatCaptionPercent(base: number, offset: number, size: number): string {
  return `${Math.round(base + (offset / size) * 100)}%`;
}

export function useCaptionBasePercent(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  model: CaptionModel | null,
  segmentId: string | undefined,
  offset: { x: number; y: number },
): CaptionBasePercent {
  const [base, setBase] = useState<CaptionBasePercent>(FRAME_CENTRE);
  const offsetRef = useLatestRef(offset);
  // Re-read only when the selection changes: the offset is subtracted, so moving the word
  // does not change its base.
  useEffect(() => {
    if (!model || !segmentId) return;
    const next = readCaptionBasePercent(iframeRef.current, model, segmentId, offsetRef.current);
    setBase(next ?? FRAME_CENTRE);
  }, [iframeRef, model, offsetRef, segmentId]);
  return base;
}
