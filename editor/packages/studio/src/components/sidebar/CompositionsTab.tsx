// Compoziții (St-Shell-Comps, St-Shell-CompsEmpty, St-Shell-CompsRender, St-Shell-CompsDrag,
// St-M-Shell-PhoneComps): one bordered row per composition with a cached thumbnail, a live
// preview after a sustained hover, lint badge, add at playhead and render.
import { buildProjectApiPath } from "../../utils/projectRouting";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCompositionThumbnailUrl } from "../../player/components/CompositionThumbnail";
import { setPreviewMediaMuted } from "../../player/lib/timelineIframeHelpers";
import { usePlayerStore } from "../../player/store/playerStore";
import { TIMELINE_COMPOSITION_MIME } from "../../utils/timelineCompositionDrop";
import { illustrationSrc } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { withContentKeys } from "../agent/stableKeys";
import { PanelIcon } from "./panelIcons";
import { PanelIconButton, PanelMessage, PanelSearch } from "./panelKit";

interface CompositionsTabProps {
  projectId: string;
  compositions: string[];
  activeComposition: string | null;
  onSelect: (comp: string) => void;
  onRenderComposition?: (comp: string) => void;
  onAddToTimeline?: (comp: string) => void;
  isRendering?: boolean;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
}

const DEFAULT_PREVIEW_STAGE = { width: 1920, height: 1080 };
const LIVE_W = 176;
const LIVE_H = 220;
const THUMBNAIL_SEEK_TIME_SECONDS = 3;
const THUMBNAIL_PLAYBACK_SYNC_ATTEMPTS = 10;
const SEARCH_THRESHOLD = 6;
type PreviewWindow = Window & {
  __player?: {
    play?: () => void;
    pause?: () => void;
    seek?: (time: number) => void;
    getDuration?: () => number;
  };
};

export function resolveCompositionPreviewScale(input: {
  cardWidth: number;
  cardHeight: number;
  stageWidth: number;
  stageHeight: number;
}): number {
  const safeStageWidth =
    Number.isFinite(input.stageWidth) && input.stageWidth > 0
      ? input.stageWidth
      : DEFAULT_PREVIEW_STAGE.width;
  const safeStageHeight =
    Number.isFinite(input.stageHeight) && input.stageHeight > 0
      ? input.stageHeight
      : DEFAULT_PREVIEW_STAGE.height;
  const scaleX = input.cardWidth / safeStageWidth;
  const scaleY = input.cardHeight / safeStageHeight;
  return Math.min(scaleX, scaleY);
}

export function resolveThumbnailSeekTime(durationSeconds: number | null | undefined): number {
  if (
    Number.isFinite(durationSeconds) &&
    durationSeconds != null &&
    durationSeconds > 0 &&
    durationSeconds < THUMBNAIL_SEEK_TIME_SECONDS
  ) {
    return durationSeconds / 2;
  }

  return THUMBNAIL_SEEK_TIME_SECONDS;
}

function parsePositiveNumber(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// fallow-ignore-next-line complexity
function resolveIframeDuration(iframe: HTMLIFrameElement | null): number | null {
  try {
    const win = iframe?.contentWindow as PreviewWindow | null;
    const playerDuration = win?.__player?.getDuration?.();
    if (Number.isFinite(playerDuration) && playerDuration != null && playerDuration > 0) {
      return playerDuration;
    }
  } catch {
    /* cross-origin iframe */
  }

  try {
    const doc = iframe?.contentDocument;
    const root = doc?.querySelector("[data-composition-id]") ?? doc?.documentElement ?? null;
    return (
      parsePositiveNumber(root?.getAttribute("data-composition-duration") ?? null) ??
      parsePositiveNumber(root?.getAttribute("data-duration") ?? null)
    );
  } catch {
    return null;
  }
}

export function syncIframePlayback(iframe: HTMLIFrameElement | null, shouldPlay: boolean): boolean {
  try {
    const player = (iframe?.contentWindow as PreviewWindow | null)?.__player;
    if (!player) return false;

    if (shouldPlay) {
      setPreviewMediaMuted(iframe, true);
      player.play?.();
      return true;
    }

    player.pause?.();
    player.seek?.(resolveThumbnailSeekTime(resolveIframeDuration(iframe)));
    return true;
  } catch {
    return false;
  }
}

function compName(comp: string): string {
  return comp.replace(/^compositions\//, "").replace(/\.html$/, "");
}

/** Hover-driven live preview: mounts the iframe only after a sustained hover. */
function useLivePreview() {
  const [hovered, setHovered] = useState(false);
  const [stageSize, setStageSize] = useState(DEFAULT_PREVIEW_STAGE);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    hoverTimer.current = null;
    syncTimer.current = null;
  }, []);

  const requestSync = useCallback((shouldPlay: boolean) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = null;
    const sync = (remaining: number) => {
      if (syncIframePlayback(iframeRef.current, shouldPlay) || remaining <= 0) return;
      syncTimer.current = setTimeout(() => sync(remaining - 1), 100);
    };
    sync(THUMBNAIL_PLAYBACK_SYNC_ATTEMPTS);
  }, []);

  const enter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(true), 300);
  }, []);
  const leave = useCallback(() => {
    clearTimers();
    setHovered(false);
    setLoaded(false);
  }, [clearTimers]);

  useEffect(() => {
    if (hovered) requestSync(true);
  }, [hovered, requestSync]);
  useEffect(() => clearTimers, [clearTimers]);

  const onLoad = useCallback(
    (iframe: HTMLIFrameElement) => {
      try {
        const root = iframe.contentDocument?.querySelector("[data-composition-id]");
        const width = Number(root?.getAttribute("data-width")) || DEFAULT_PREVIEW_STAGE.width;
        const height = Number(root?.getAttribute("data-height")) || DEFAULT_PREVIEW_STAGE.height;
        setStageSize({ width, height });
        setLoaded(true);
        requestSync(true);
      } catch {
        setStageSize(DEFAULT_PREVIEW_STAGE);
      }
    },
    [requestSync],
  );

  return { hovered, stageSize, loaded, iframeRef, enter, leave, onLoad };
}

type LivePreview = ReturnType<typeof useLivePreview>;

/** Floating "Previzualizare live" card next to the row (St-Shell-Comps). */
function LivePreviewCard({
  name,
  previewUrl,
  anchor,
  live,
}: {
  name: string;
  previewUrl: string;
  anchor: DOMRect | null;
  live: LivePreview;
}) {
  const scale = resolveCompositionPreviewScale({
    cardWidth: LIVE_W,
    cardHeight: LIVE_H,
    stageWidth: live.stageSize.width,
    stageHeight: live.stageSize.height,
  });
  const offsetX = (LIVE_W - live.stageSize.width * scale) / 2;
  const offsetY = (LIVE_H - live.stageSize.height * scale) / 2;
  const top = anchor ? Math.max(8, Math.min(anchor.top - 80, window.innerHeight - LIVE_H - 80)) : 0;
  return (
    <section
      role="dialog"
      aria-label={t("comps.livePreview")}
      className="fixed z-[120] flex w-[200px] flex-col gap-2.5 rounded-card bg-studio-surface p-3 text-studio-text shadow-[var(--st-sh),0_24px_60px_rgba(21,32,53,.22),inset_0_0_0_1px_var(--st-bd)]"
      style={{ left: (anchor?.right ?? 0) + 24, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-8 items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {t("comps.livePreview")}
        </b>
        <PanelIconButton icon="close" label={t("media.previewClose")} onClick={live.leave} />
      </div>
      <div
        className="relative overflow-hidden rounded-[16px] bg-[var(--st-sub)]"
        style={{ width: LIVE_W, height: LIVE_H }}
      >
        <iframe
          ref={live.iframeRef}
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin"
          className={`pointer-events-none absolute border-none transition-opacity ${live.loaded ? "opacity-100" : "opacity-0"}`}
          style={{
            transformOrigin: "0 0",
            width: live.stageSize.width,
            height: live.stageSize.height,
            left: offsetX,
            top: offsetY,
            transform: `scale(${scale})`,
          }}
          onLoad={(e) => live.onLoad(e.currentTarget)}
          title={`${name} preview`}
          tabIndex={-1}
        />
        <span className="absolute left-2 top-2 h-5 rounded-[6px] bg-studio-surface px-1.5 text-[11px] font-semibold leading-5">
          {name}
        </span>
      </div>
    </section>
  );
}

/** Lint count tag; hovering or focusing it lists the findings (St-Shell-Comps). */
function LintBadge({ name, info }: { name: string; info: { count: number; messages: string[] } }) {
  const [open, setOpen] = useState(false);
  const label = info.count === 1 ? t("code.lintCountOne") : t("code.lintCount", { n: info.count });
  return (
    <span
      className="relative flex-none"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        role="note"
        aria-label={label}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-[22px] items-center gap-1 rounded-[8px] bg-[var(--st-warn-bg)] px-[7px] text-[11px] font-semibold text-[var(--st-warn-text)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
      >
        <PanelIcon name="warn" size={12} />
        {info.count}
      </span>
      {open ? (
        <span
          role="dialog"
          aria-label={t("comps.lintIssues")}
          className="absolute right-0 top-7 z-30 flex w-60 flex-col gap-2 rounded-[20px] bg-studio-surface p-4 shadow-[var(--st-sh),0_16px_40px_rgba(21,32,53,.16)]"
        >
          <span className="text-xs font-semibold text-[var(--st-t2)]">{name}</span>
          {withContentKeys(info.messages, (message) => message).map(({ key, item: message }) => (
            <span key={key} className="text-[13px] font-medium">
              {message}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

interface CompCardProps {
  projectId: string;
  comp: string;
  isActive: boolean;
  onSelect: () => void;
  onRender?: () => void;
  isRendering?: boolean;
  lintInfo?: { count: number; messages: string[] };
  onAddToTimeline?: () => void;
  contentRevision: number;
}

function RowActions({
  name,
  onAddToTimeline,
  onRender,
  isRendering,
}: Pick<CompCardProps, "onAddToTimeline" | "onRender" | "isRendering"> & { name: string }) {
  return (
    <>
      {onAddToTimeline ? (
        <PanelIconButton
          icon="addAtPlayhead"
          label={t("comps.addAtPlayhead")}
          className="!h-[30px] !w-[30px]"
          onClick={(event) => {
            event.stopPropagation();
            onAddToTimeline();
          }}
          onKeyDown={(event) => event.stopPropagation()}
        />
      ) : null}
      {onRender ? (
        <PanelIconButton
          icon="render"
          label={isRendering ? t("comps.renderBusy") : t("comps.render", { name })}
          className="!h-[30px] !w-[30px]"
          disabled={isRendering}
          onClick={(event) => {
            event.stopPropagation();
            onRender();
          }}
        />
      ) : null}
    </>
  );
}

function CompCard({
  projectId,
  comp,
  isActive,
  onSelect,
  onRender,
  isRendering,
  lintInfo,
  onAddToTimeline,
  contentRevision,
}: CompCardProps) {
  const live = useLivePreview();
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const draggedRef = useRef(false);
  const name = compName(comp);
  const previewUrl = buildProjectApiPath(projectId, `/preview/comp/${comp}`);
  const thumbnailUrl = buildCompositionThumbnailUrl({
    previewUrl,
    seekTime: THUMBNAIL_SEEK_TIME_SECONDS,
    duration: 0,
    origin: window.location.origin,
    contentRevision,
  });
  const thumbnailFailed = failedThumbnailUrl === thumbnailUrl;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-composition={comp}
      aria-label={t("comps.open", { name })}
      aria-pressed={isActive}
      onDragStart={(event) => {
        draggedRef.current = true;
        live.leave();
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(TIMELINE_COMPOSITION_MIME, JSON.stringify({ sourcePath: comp }));
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      onClick={() => {
        if (!draggedRef.current) onSelect();
      }}
      onKeyDown={(event) => {
        // Only the row itself: inner buttons keep their native activation.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerEnter={(event) => {
        setAnchor(event.currentTarget.getBoundingClientRect());
        live.enter();
      }}
      onPointerLeave={live.leave}
      className={`flex min-w-0 cursor-grab select-none items-center gap-2.5 rounded-md bg-studio-surface p-2 outline-none transition-shadow active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${
        isActive
          ? "shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
          : "shadow-[inset_0_0_0_1px_var(--st-bd)] hover:shadow-[inset_0_0_0_1px_var(--st-sbd)]"
      }`}
    >
      <span className="relative h-10 w-14 flex-none overflow-hidden rounded-[10px] bg-[var(--st-sub)]">
        {thumbnailFailed ? (
          <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[9px] font-semibold leading-tight text-[var(--st-t2)]">
            {t("comps.unavailable")}
          </span>
        ) : (
          <img
            src={thumbnailUrl}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setFailedThumbnailUrl(thumbnailUrl)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[13px] font-semibold">{name}</b>
        <span className="truncate text-xs text-[var(--st-t2)]">{comp}</span>
      </span>
      {lintInfo && lintInfo.count > 0 ? <LintBadge name={name} info={lintInfo} /> : null}
      <RowActions
        name={name}
        onAddToTimeline={onAddToTimeline}
        onRender={onRender}
        isRendering={isRendering}
      />
      {live.hovered ? (
        <LivePreviewCard name={name} previewUrl={previewUrl} anchor={anchor} live={live} />
      ) : null}
    </div>
  );
}

export const CompositionsTab = memo(function CompositionsTab({
  projectId,
  compositions,
  activeComposition,
  onSelect,
  onRenderComposition,
  onAddToTimeline,
  isRendering,
  lintFindingsByFile,
}: CompositionsTabProps) {
  useLocale();
  const contentRevision = usePlayerStore((state) => state.thumbnailContentRevision);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? compositions.filter((c) => c.toLowerCase().includes(q)) : compositions;
  }, [compositions, query]);
  const showSearch = compositions.length >= SEARCH_THRESHOLD || compositions.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showSearch ? (
        <PanelSearch value={query} onChange={setQuery} label={t("comps.search")} />
      ) : null}
      {visible.length === 0 ? (
        <PanelMessage
          illustration={illustrationSrc("studio-empty-project")}
          title={t("comps.empty")}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-0.5">
          {visible.map((comp) => (
            <CompCard
              key={`${projectId}:${comp}`}
              projectId={projectId}
              comp={comp}
              isActive={activeComposition === comp}
              onSelect={() => onSelect(comp)}
              onRender={onRenderComposition ? () => onRenderComposition(comp) : undefined}
              onAddToTimeline={onAddToTimeline ? () => onAddToTimeline(comp) : undefined}
              isRendering={isRendering}
              lintInfo={lintFindingsByFile?.get(comp)}
              contentRevision={contentRevision}
            />
          ))}
        </div>
      )}
    </div>
  );
});
