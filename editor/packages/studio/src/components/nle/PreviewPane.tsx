import { useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PlayerControls } from "../../player";
import type { TimelineElement } from "../../player";
import { t, useLocale } from "../../i18n/translate";
import { NLEPreview } from "./NLEPreview";
import { CompositionBreadcrumb } from "./CompositionBreadcrumb";
import { usePreviewBlockDrop } from "./usePreviewBlockDrop";
import { useNLEContext } from "./NLEContext";
import { AssetPreviewOverlay } from "./AssetPreviewOverlay";
import { useIsPhone } from "../shell/useIsPhone";
import { PreviewHeader } from "./preview/PreviewHeader";
import { PhonePlaybackSheets } from "./preview/PhonePlaybackSheets";
import { PreviewIcon, PrimaryPill } from "./preview/previewChrome";
import {
  PreviewHeaderSkeleton,
  PreviewStageSkeleton,
  PreviewTransportSkeleton,
} from "./preview/PreviewSkeleton";
import type { PreviewZoomApi } from "./preview/usePreviewZoom";
import { ORIGINAL_EXPORT_PATH } from "./preview/OriginalVideoPanel";
import { usePhoneStageReserve } from "./preview/phoneStageReserve";

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

function getFullscreenElement() {
  return document.fullscreenElement;
}

// Clear the timeline selection when a pointer lands outside the composition
// frame (clicks *inside* the frame are handled by the DOM-edit overlay).
// fallow-ignore-next-line complexity
function deselectIfPointerOutsideFrame(
  e: React.PointerEvent,
  iframe: HTMLIFrameElement | null,
  onDeselect?: (element: null) => void,
): void {
  const el = iframe?.parentElement ?? iframe;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const outside =
    e.clientX < rect.left ||
    e.clientX > rect.right ||
    e.clientY < rect.top ||
    e.clientY > rect.bottom;
  if (outside) onDeselect?.(null);
}

/** Dashed frame, light scrim and "Plasează la cursor" while a block is dragged over the canvas. */
function PreviewDropOverlay() {
  useLocale();
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-sm border-2 border-dashed border-[var(--st-sbd)] bg-[color-mix(in_srgb,var(--st-ov)_35%,transparent)]">
      <PrimaryPill height={40} tabIndex={-1}>
        {t("preview.dropAtPlayhead")}
      </PrimaryPill>
    </div>
  );
}

export interface PreviewPaneProps {
  portrait?: boolean;
  /** Slot for overlays rendered on top of the preview (cursors, highlights, etc.) */
  previewOverlay?: ReactNode;
  onSelectTimelineElement?: (element: TimelineElement | null) => void;
  onPreviewBlockDrop?: (
    blockName: string,
    position: { left: number; top: number },
  ) => Promise<void> | void;
}

/**
 * Preview card (St-Main): header with zoom, optional composition breadcrumb, the canvas with its
 * overlays, and the transport. On phone the card chrome drops away (St-M-Main) and the extra
 * playback controls move to bottom sheets. Fullscreen shows the canvas on black with a floating
 * transport bar (St-Preview-Fullscreen).
 */
// fallow-ignore-next-line complexity
export function PreviewPane({
  portrait,
  previewOverlay,
  onSelectTimelineElement,
  onPreviewBlockDrop,
}: PreviewPaneProps) {
  useLocale();
  const isPhone = useIsPhone();
  const phoneReserve = usePhoneStageReserve();
  const {
    projectId,
    iframeRef,
    togglePlay,
    seek,
    onIframeLoad,
    compositionStack,
    handleNavigateComposition,
    setCompositionLoading,
    timelineDisabled,
    hasLoadedOnceRef,
    previewCompositionSize,
    setPreviewCompositionSize,
    compositionLoading,
  } = useNLEContext();

  const stageRefForDrop = useRef<HTMLDivElement | null>(null);
  const handleStageRef = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    stageRefForDrop.current = ref.current;
  }, []);
  const zoomApiRef = useRef<PreviewZoomApi | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [cardElement, setCardElement] = useState<HTMLElement | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const {
    isDragOver: previewDragOver,
    handleDragEnter: handlePreviewDragEnter,
    handleDragOver: handlePreviewDragOver,
    handleDragLeave: handlePreviewDragLeave,
    handleDrop: handlePreviewDrop,
  } = usePreviewBlockDrop({
    portrait,
    compositionSize: previewCompositionSize,
    stageRef: stageRefForDrop as React.RefObject<HTMLDivElement | null>,
    onBlockDrop: onPreviewBlockDrop,
  });

  // Preview-only fullscreen: fullscreen targets THIS pane's container, so the
  // browser shows only the preview (sidebars + timeline are excluded naturally).
  const containerRef = useRef<HTMLElement | null>(null);
  const setContainer = useCallback((node: HTMLElement | null) => {
    containerRef.current = node;
    setCardElement(node);
  }, []);
  const fullscreenElement = useSyncExternalStore(subscribeFullscreen, getFullscreenElement);
  const isFullscreen = fullscreenElement === containerRef.current && fullscreenElement != null;

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current.requestFullscreen();
    }
  }, []);

  const currentLevel = compositionStack[compositionStack.length - 1];
  const directUrl = compositionStack.length > 1 ? currentLevel.previewUrl : undefined;
  // The read-only original (St-Original) is not a sub-composition: no breadcrumb.
  const showBreadcrumb =
    !isFullscreen && compositionStack.length > 1 && currentLevel.id !== ORIGINAL_EXPORT_PATH;
  const showCardChrome = !isFullscreen && !isPhone;
  // First load only (St-Preview-Loading): the card shows skeletons under the loading card.
  const firstLoad = compositionLoading && !hasLoadedOnceRef.current;

  const frameClass = isFullscreen
    ? "relative flex min-h-0 flex-1 flex-col bg-black p-[18px]"
    : isPhone
      ? "relative flex min-h-0 flex-1 flex-col bg-studio-bg pt-1.5"
      : "relative flex min-h-0 flex-1 flex-col gap-3 rounded-card bg-studio-surface p-4 text-studio-text shadow-studio";

  return (
    <section
      ref={setContainer}
      aria-label={t("preview.title")}
      className={frameClass}
      data-studio-fullscreen-target=""
      data-preview-card=""
    >
      {showCardChrome &&
        (firstLoad ? (
          <PreviewHeaderSkeleton />
        ) : (
          <PreviewHeader zoomApiRef={zoomApiRef} disabled={previewFailed} />
        ))}
      {showBreadcrumb && (
        <CompositionBreadcrumb
          stack={compositionStack}
          onNavigate={handleNavigateComposition}
          centered={isPhone}
        />
      )}
      {isPhone && phoneReserve > 0 && (
        <div aria-hidden="true" className="flex-none" style={{ height: phoneReserve }} />
      )}
      <div
        className="group/preview relative min-h-0 flex-1"
        data-preview-pan-surface="true"
        style={
          {
            "--preview-stage-w": `${stageSize.width}px`,
            "--preview-stage-h": `${stageSize.height}px`,
          } as React.CSSProperties
        }
        onPointerDown={(e) =>
          deselectIfPointerOutsideFrame(e, iframeRef.current, onSelectTimelineElement)
        }
        onDragEnter={handlePreviewDragEnter}
        onDragOver={handlePreviewDragOver}
        onDragLeave={handlePreviewDragLeave}
        onDrop={handlePreviewDrop}
      >
        <div className="absolute inset-0">
          <NLEPreview
            projectId={projectId}
            iframeRef={iframeRef}
            onIframeLoad={onIframeLoad}
            onCompositionLoadingChange={setCompositionLoading}
            portrait={portrait}
            directUrl={directUrl}
            suppressLoadingOverlay={hasLoadedOnceRef.current}
            onStageRef={handleStageRef}
            onCompositionSizeChange={setPreviewCompositionSize}
            zoomApiRef={zoomApiRef}
            onStageSizeChange={setStageSize}
            statusHost={isFullscreen ? null : cardElement}
            onPreviewErrorChange={setPreviewFailed}
          />
          {firstLoad && <PreviewStageSkeleton />}
          {previewDragOver && <PreviewDropOverlay />}
        </div>
        {!isFullscreen && previewOverlay}
        {isFullscreen && (
          <button
            type="button"
            aria-label={t("preview.exitFullscreen")}
            title={`${t("preview.exitFullscreen")} (F)`}
            onClick={toggleFullscreen}
            className="absolute right-[-4px] top-[-4px] z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,white_16%,transparent)] text-white"
          >
            <PreviewIcon name="exitFullscreen" />
          </button>
        )}
      </div>
      {isFullscreen ? (
        <div
          className="absolute bottom-[34px] left-1/2 z-50 -translate-x-1/2"
          style={{ width: `min(500px, ${Math.max(320, stageSize.width + 14)}px, 100% - 36px)` }}
        >
          <PlayerControls
            onTogglePlay={togglePlay}
            onSeek={seek}
            disabled={timelineDisabled || previewFailed}
            isFullscreen
            onToggleFullscreen={toggleFullscreen}
            layout="fullscreen"
          />
        </div>
      ) : firstLoad && !isPhone ? (
        <PreviewTransportSkeleton />
      ) : (
        <PlayerControls
          onTogglePlay={togglePlay}
          onSeek={seek}
          disabled={timelineDisabled || previewFailed}
          isFullscreen={false}
          onToggleFullscreen={toggleFullscreen}
          layout={isPhone ? "phone" : "desktop"}
        />
      )}
      <AssetPreviewOverlay />
      {isPhone && (
        <PhonePlaybackSheets
          onSeek={seek}
          disabled={timelineDisabled || previewFailed}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
    </section>
  );
}
