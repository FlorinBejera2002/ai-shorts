import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Player } from "../../player";
import { useLatestRef } from "../../hooks/useLatestRef";
import { toDomPrecision } from "./previewZoom";
import { t, useLocale } from "../../i18n/translate";
import { CANVAS_CHIP, OutlinePill } from "./preview/previewChrome";
import {
  isPreviewAtFit,
  stageTransform,
  usePreviewZoom,
  type PreviewZoomApi,
} from "./preview/usePreviewZoom";

interface NLEPreviewProps {
  projectId: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onIframeLoad: () => void;
  onCompositionLoadingChange?: (loading: boolean) => void;
  portrait?: boolean;
  directUrl?: string;
  suppressLoadingOverlay?: boolean;
  onStageRef?: (ref: React.RefObject<HTMLDivElement | null>) => void;
  /** Reports the authored composition size measured from the loaded preview. */
  onCompositionSizeChange?: (size: PreviewCompositionSize | null) => void;
  /** Receives the zoom controls for the preview card header. */
  zoomApiRef?: RefObject<PreviewZoomApi | null>;
  /** Reports the fitted stage size (canvas chrome anchors to the stage corners). */
  onStageSizeChange?: (size: { width: number; height: number }) => void;
  /** Card element that hosts the loading and error overlays (St-Preview-Loading). */
  statusHost?: HTMLElement | null;
  onPreviewErrorChange?: (failed: boolean) => void;
}

export function getPreviewPlayerKey({
  projectId,
  directUrl,
}: {
  projectId: string;
  directUrl?: string;
}): string {
  return directUrl ?? projectId;
}

/** The stage keeps no inset: the card's 16px padding is the breathing room (St-Main). */
const PREVIEW_STAGE_INSET_PX = 0;

interface PreviewCompositionSize {
  width: number;
  height: number;
}

// fallow-ignore-next-line complexity
function readPreviewCompositionSize(
  iframe: HTMLIFrameElement | null,
): PreviewCompositionSize | null {
  try {
    const doc = iframe?.contentDocument;
    const root =
      doc?.querySelector("[data-composition-id][data-width][data-height]") ??
      doc?.querySelector("[data-width][data-height]");
    if (!root) return null;
    const width = Number.parseInt(root.getAttribute("data-width") ?? "", 10);
    const height = Number.parseInt(root.getAttribute("data-height") ?? "", 10);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      return null;
    }
    return { width, height };
  } catch {
    return null;
  }
}

export function resolvePreviewStageSize(
  viewportWidth: number,
  viewportHeight: number,
  compositionSize: PreviewCompositionSize | null,
  portrait: boolean | undefined,
  inset = PREVIEW_STAGE_INSET_PX,
): { width: number; height: number } {
  const availableWidth = Math.max(0, viewportWidth - inset);
  const availableHeight = Math.max(0, viewportHeight - inset);
  const aspectRatio =
    compositionSize && compositionSize.width > 0 && compositionSize.height > 0
      ? compositionSize.width / compositionSize.height
      : portrait
        ? 9 / 16
        : 16 / 9;

  if (availableWidth === 0 || availableHeight === 0) {
    return { width: 0, height: 0 };
  }

  let width = availableWidth;
  let height = width / aspectRatio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspectRatio;
  }

  return {
    width: toDomPrecision(width),
    height: toDomPrecision(height),
  };
}

export const NLEPreview = memo(function NLEPreview({
  projectId,
  iframeRef,
  onIframeLoad,
  onCompositionLoadingChange,
  portrait,
  directUrl,
  suppressLoadingOverlay,
  onStageRef,
  onCompositionSizeChange,
  zoomApiRef,
  onStageSizeChange,
  statusHost,
  onPreviewErrorChange,
}: NLEPreviewProps) {
  useLocale();
  const activeKey = getPreviewPlayerKey({ projectId, directUrl });
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => {
    onStageRef?.(stageRef);
  }, [onStageRef]);
  const [compositionSize, setCompositionSize] = useState<PreviewCompositionSize | null>(null);
  const [stageSize, setStageSize] = useState(() => resolvePreviewStageSize(0, 0, null, portrait));
  const stageSizeRef = useLatestRef(stageSize);
  const onStageSizeChangeRef = useLatestRef(onStageSizeChange);

  const { initialZoom, settledZoom, hudRef, api, applyInitialZoom } = usePreviewZoom({
    viewportRef,
    stageRef,
    stageSizeRef,
    fitLabel: t("preview.fitted"),
  });
  // Published in a layout effect so the ref is never written during render.
  useLayoutEffect(() => {
    if (zoomApiRef) zoomApiRef.current = api;
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateStageSize = () => {
      const rect = viewport.getBoundingClientRect();
      const next = resolvePreviewStageSize(rect.width, rect.height, compositionSize, portrait);
      setStageSize(next);
      // Notify the parent where the size is produced rather than from an effect on stageSize.
      onStageSizeChangeRef.current?.(next);
    };
    updateStageSize();
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [compositionSize, portrait, onStageSizeChangeRef]);

  const onCompositionSizeChangeRef = useLatestRef(onCompositionSizeChange);

  const updateCompositionSizeFromPreview = useCallback(() => {
    const next = readPreviewCompositionSize(previewIframeRef.current);
    // Pure updater — the parent notification happens in the effect below
    // (updaters may run more than once under Strict Mode / concurrent React).
    // A failed read (an errored or blank load) keeps the last known size so the stage does
    // not jump to the 16:9 fallback (St-PreviewError keeps the clip's frame).
    setCompositionSize((prev) =>
      !next || (prev?.width === next.width && prev?.height === next.height) ? prev : next,
    );
  }, []);

  useEffect(() => {
    onCompositionSizeChangeRef.current?.(compositionSize);
  }, [compositionSize, onCompositionSizeChangeRef]);

  // The iframe's load event can fire before the composition root is parsed; read the size
  // again once the composition reports ready, or the stage keeps the 16:9 fallback.
  const handleCompositionLoadingChange = useCallback(
    (loading: boolean) => {
      if (!loading) updateCompositionSizeFromPreview();
      onCompositionLoadingChange?.(loading);
    },
    [onCompositionLoadingChange, updateCompositionSizeFromPreview],
  );

  const setPreviewIframeRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      previewIframeRef.current = node;
      iframeRef.current = node;
    },
    [iframeRef],
  );

  const isComponentPreview = directUrl?.includes("/components/") ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={viewportRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-btn)]"
        tabIndex={0}
        aria-label={t("preview.canvasLabel")}
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            ref={stageRef}
            className="pointer-events-auto relative shrink-0 overflow-hidden rounded-[12px]"
            style={{
              width: `${stageSize.width}px`,
              height: `${stageSize.height}px`,
              transform: stageTransform(initialZoom),
              // resolvePreviewWheelZoom cursor math assumes center-center pivot
              transformOrigin: "center center",
            }}
            data-testid="preview-zoom-stage"
          >
            {isComponentPreview && (
              <Player
                key={`backdrop-${projectId}`}
                projectId={projectId}
                onLoad={() => {}}
                portrait={portrait}
                suppressLoadingOverlay
                style={{ position: "absolute", inset: 0, zIndex: 0 }}
              />
            )}
            <Player
              key={activeKey}
              ref={setPreviewIframeRef}
              projectId={directUrl ? undefined : projectId}
              directUrl={directUrl}
              onLoad={() => {
                updateCompositionSizeFromPreview();
                onIframeLoad();
                applyInitialZoom();
              }}
              onCompositionLoadingChange={handleCompositionLoadingChange}
              portrait={portrait}
              suppressLoadingOverlay={suppressLoadingOverlay}
              statusHost={statusHost}
              onPreviewErrorChange={onPreviewErrorChange}
              style={isComponentPreview ? { position: "absolute", inset: 0, zIndex: 1 } : undefined}
            />
          </div>
        </div>
        <span
          ref={hudRef}
          role="status"
          aria-live="polite"
          className={`pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 ${CANVAS_CHIP}`}
          style={{ opacity: 0, transition: "opacity 200ms ease-in" }}
        />
        {!isPreviewAtFit(settledZoom) && (
          <div
            className="absolute bottom-3.5 z-50"
            style={{ right: `max(10px, calc(50% - ${stageSize.width / 2}px + 10px))` }}
          >
            <OutlinePill
              height={30}
              className="!bg-studio-surface !shadow-studio"
              onClick={api.fit}
              aria-label={t("preview.resetZoom")}
              data-testid="preview-reset-zoom"
            >
              {t("preview.resetZoomValue", { n: Math.round(settledZoom.zoomPercent) })}
            </OutlinePill>
          </div>
        )}
      </div>
    </div>
  );
});
