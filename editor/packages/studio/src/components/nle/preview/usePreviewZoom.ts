// Preview zoom and pan: ctrl/cmd + wheel zooms around the cursor, wheel and middle/space drag
// pan, the header buttons step by 25% and "Potrivește" fits. The transform is written straight
// to the stage element per frame; React state only settles after a gesture (HUD, reset button,
// persisted preference).
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  DEFAULT_PREVIEW_ZOOM,
  canStartPreviewPan,
  clampPreviewPan,
  clampPreviewZoomPercent,
  getNextPreviewZoomPercent,
  ownsPreviewPanTarget,
  resolvePreviewWheelPan,
  resolvePreviewWheelZoom,
  toDomPrecision,
  type PreviewZoomState,
} from "../previewZoom";
import { useLatestRef } from "../../../hooks/useLatestRef";
import {
  readStudioUiPreferences,
  writeStudioUiPreferences,
} from "../../../utils/studioUiPreferences";

const ZOOM_HUD_TIMEOUT_MS = 1200;
const ZOOM_SETTLE_MS = 200;

export interface PreviewZoomApi {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

export function isPreviewAtFit(state: PreviewZoomState): boolean {
  return (
    Math.abs(state.zoomPercent - 100) < 0.5 &&
    Math.abs(state.panX) < 0.1 &&
    Math.abs(state.panY) < 0.1
  );
}

function loadInitialZoom(): PreviewZoomState {
  const stored = readStudioUiPreferences().previewZoom;
  return stored
    ? {
        zoomPercent: clampPreviewZoomPercent(stored.zoomPercent),
        panX: stored.panX,
        panY: stored.panY,
      }
    : DEFAULT_PREVIEW_ZOOM;
}

export function stageTransform(state: PreviewZoomState): string {
  const s = toDomPrecision(state.zoomPercent / 100);
  return `translate3d(${toDomPrecision(state.panX)}px, ${toDomPrecision(state.panY)}px, 0) scale(${s})`;
}

interface UsePreviewZoomInput {
  viewportRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  stageSizeRef: RefObject<{ width: number; height: number }>;
  /** Text shown in the HUD at 100% (the localized "Potrivit"). */
  fitLabel: string;
}

/** Written as an outside test so events without coordinates (synthetic wheels) count as inside. */
function isInside(rect: DOMRect, x: number, y: number): boolean {
  return !(x < rect.left || x > rect.right || y < rect.top || y > rect.bottom);
}

// fallow-ignore-next-line complexity
export function usePreviewZoom({
  viewportRef,
  stageRef,
  stageSizeRef,
  fitLabel,
}: UsePreviewZoomInput) {
  const zoomRef = useRef<PreviewZoomState>(loadInitialZoom());
  const [settledZoom, setSettledZoom] = useState<PreviewZoomState>(() => zoomRef.current);
  const hudRef = useRef<HTMLSpanElement>(null);
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomingRef = useRef(false);
  const fitLabelRef = useLatestRef(fitLabel);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  const hudText = useCallback(
    (state: PreviewZoomState) =>
      isPreviewAtFit(state) ? fitLabelRef.current : `${Math.round(state.zoomPercent)}%`,
    [fitLabelRef],
  );

  const writeTransform = useCallback(
    (state: PreviewZoomState) => {
      const stage = stageRef.current;
      if (stage) stage.style.transform = stageTransform(state);
    },
    [stageRef],
  );

  const applyTransform = useCallback(
    (next: PreviewZoomState, showHud: boolean) => {
      const clamped: PreviewZoomState = {
        zoomPercent: clampPreviewZoomPercent(next.zoomPercent),
        panX: Number.isFinite(next.panX) ? next.panX : 0,
        panY: Number.isFinite(next.panY) ? next.panY : 0,
      };
      zoomRef.current = clamped;
      const hud = hudRef.current;
      if (showHud && hud) {
        if (!zoomingRef.current) {
          zoomingRef.current = true;
          hud.style.opacity = "1";
        }
        // Live per-frame readout: without it the HUD shows a stale percentage mid-gesture.
        hud.textContent = hudText(clamped);
      }
      writeTransform(clamped);

      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        zoomingRef.current = false;
        const final = zoomRef.current;
        writeStudioUiPreferences({ previewZoom: final });
        setSettledZoom((prev) =>
          prev.zoomPercent === final.zoomPercent &&
          prev.panX === final.panX &&
          prev.panY === final.panY
            ? prev
            : final,
        );
        const settledHud = hudRef.current;
        if (!showHud || !settledHud) return;
        settledHud.textContent = hudText(final);
        if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
        hudTimerRef.current = setTimeout(() => {
          if (hudRef.current) hudRef.current.style.opacity = "0";
        }, ZOOM_HUD_TIMEOUT_MS);
      }, ZOOM_SETTLE_MS);
    },
    [hudText, writeTransform],
  );

  const applyZoom = useCallback(
    (next: PreviewZoomState) => applyTransform(next, true),
    [applyTransform],
  );
  const applyPan = useCallback(
    (next: PreviewZoomState) => applyTransform(next, false),
    [applyTransform],
  );

  const stepZoom = useCallback(
    (direction: "in" | "out") => {
      const current = zoomRef.current;
      const zoomPercent = getNextPreviewZoomPercent(direction, current.zoomPercent);
      const ratio = zoomPercent / clampPreviewZoomPercent(current.zoomPercent);
      applyZoom({ zoomPercent, panX: current.panX * ratio, panY: current.panY * ratio });
    },
    [applyZoom],
  );

  const api: PreviewZoomApi = {
    zoomIn: () => stepZoom("in"),
    zoomOut: () => stepZoom("out"),
    fit: () => applyZoom(DEFAULT_PREVIEW_ZOOM),
  };

  const applyInitialZoom = useCallback(() => {
    const z = zoomRef.current;
    if (isPreviewAtFit(z)) return;
    // A pan persisted on a large window can restore the composition mostly
    // off-screen in a smaller one; clamp against the current viewport first.
    const rect = viewportRef.current?.getBoundingClientRect();
    const sz = stageSizeRef.current;
    if (rect && rect.width > 0 && rect.height > 0 && sz.width > 0 && sz.height > 0) {
      const pan = clampPreviewPan({
        panX: z.panX,
        panY: z.panY,
        zoomPercent: z.zoomPercent,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        contentWidth: sz.width,
        contentHeight: sz.height,
      });
      zoomRef.current = { ...z, ...pan };
    }
    writeTransform(zoomRef.current);
  }, [stageSizeRef, viewportRef, writeTransform]);

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      if (!isInside(rect, event.clientX, event.clientY)) return;
      const sz = stageSizeRef.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        applyZoom(
          resolvePreviewWheelZoom({
            state: zoomRef.current,
            deltaY: event.deltaY,
            viewportWidth: rect.width,
            viewportHeight: rect.height,
            contentWidth: sz.width,
            contentHeight: sz.height,
            cursorX: event.clientX - (rect.left + rect.width / 2),
            cursorY: event.clientY - (rect.top + rect.height / 2),
          }),
        );
        return;
      }
      if (!ownsPreviewPanTarget(event.target, stageRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      applyPan(
        resolvePreviewWheelPan({
          state: zoomRef.current,
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
          contentWidth: sz.width,
          contentHeight: sz.height,
        }),
      );
    };
    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", handleWheel, { capture: true });
  }, [applyZoom, applyPan, stageRef, stageSizeRef, viewportRef]);

  useEffect(() => {
    const viewportRectAt = (clientX: number, clientY: number): DOMRect | null => {
      const rect = viewportRef.current?.getBoundingClientRect();
      return rect && isInside(rect, clientX, clientY) ? rect : null;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!viewportRectAt(event.clientX, event.clientY)) return;
      if (!ownsPreviewPanTarget(event.target, stageRef.current)) return;
      if (!canStartPreviewPan(event.button)) return;
      event.preventDefault();
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: zoomRef.current.panX,
        originY: zoomRef.current.panY,
      };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const viewport = viewportRef.current;
      if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const sz = stageSizeRef.current;
      const pan = clampPreviewPan({
        panX: drag.originX + event.clientX - drag.startX,
        panY: drag.originY + event.clientY - drag.startY,
        zoomPercent: zoomRef.current.zoomPercent,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        contentWidth: sz.width,
        contentHeight: sz.height,
      });
      applyPan({ ...zoomRef.current, ...pan });
    };
    const finishDrag = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };
    const handleAuxClick = (event: MouseEvent) => {
      if (event.button !== 1) return;
      if (!viewportRectAt(event.clientX, event.clientY)) return;
      if (!ownsPreviewPanTarget(event.target, stageRef.current)) return;
      event.preventDefault();
    };
    const capture = { capture: true } as const;
    document.addEventListener("pointerdown", handlePointerDown, capture);
    document.addEventListener("pointermove", handlePointerMove, capture);
    document.addEventListener("pointerup", finishDrag, capture);
    document.addEventListener("pointercancel", finishDrag, capture);
    document.addEventListener("auxclick", handleAuxClick, capture);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, capture);
      document.removeEventListener("pointermove", handlePointerMove, capture);
      document.removeEventListener("pointerup", finishDrag, capture);
      document.removeEventListener("pointercancel", finishDrag, capture);
      document.removeEventListener("auxclick", handleAuxClick, capture);
    };
  }, [applyPan, stageRef, stageSizeRef, viewportRef]);

  return {
    initialZoom: zoomRef.current,
    settledZoom,
    hudRef,
    api,
    applyInitialZoom,
  };
}
