/**
 * AssetCard (image/video tile) and FontRow for the Media panel, per St-Media and
 * St-Shell-MediaRows: 96px thumbnail with 12px radius, duration bottom-left, "Adăugat" tag
 * top-right, file name under it; fonts as bordered rows with an "A" tile.
 */
import { useState, useEffect } from "react";
import { VideoFrameThumbnail } from "../ui/VideoFrameThumbnail";
import { VIDEO_EXT, IMAGE_EXT } from "../../utils/mediaTypes";
import { TIMELINE_ASSET_MIME } from "../../utils/timelineAssetDrop";
import { ContextMenu } from "./AssetContextMenu";
import { t, useLocale } from "../../i18n/translate";
import { basename, ext, filename, formatShortDuration, type CopyFeedback } from "./assetHelpers";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import { useAssetActivation } from "./useAssetActivation";
import { PanelTag } from "./panelKit";

/** Drag payload shared by every asset tile and row: timeline-asset MIME plus a path fallback. */
export function writeAssetDragData(e: React.DragEvent, asset: string): void {
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData(TIMELINE_ASSET_MIME, JSON.stringify({ path: asset }));
  e.dataTransfer.setData("text/plain", asset);
}

/** Copy-path outcome tag, shown only after a copy succeeded or failed. */
export function CopyChip({ feedback, asset }: { feedback: CopyFeedback; asset: string }) {
  if (feedback?.path !== asset) return null;
  return (
    <span className="self-start">
      <PanelTag
        tone={feedback.ok ? "ok" : "danger"}
        icon={feedback.ok ? "check" : "warn"}
        height={24}
        role="status"
      >
        {feedback.ok ? t("media.copied") : t("media.copyFailed")}
      </PanelTag>
    </span>
  );
}

type MenuPos = { x: number; y: number } | null;

/**
 * Probe a video URL for its duration with a hidden video element (`preload="metadata"`).
 * The manifest only covers ~/.media assets, so project files need this.
 * `undefined` until done, `null` when it failed.
 */
function useProbedDuration(src: string, skip: boolean): number | null | undefined {
  const [duration, setDuration] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let liveVid: HTMLVideoElement | null = null;

    function teardown(vid: HTMLVideoElement) {
      vid.onloadedmetadata = null;
      vid.onerror = null;
      vid.src = "";
    }

    function probe(attempt: number) {
      if (cancelled) return;
      const vid = document.createElement("video");
      liveVid = vid;
      vid.preload = "metadata";
      vid.muted = true;
      vid.onloadedmetadata = () => {
        const d = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : null;
        teardown(vid);
        if (!cancelled) setDuration(d);
      };
      vid.onerror = () => {
        teardown(vid);
        if (cancelled) return;
        if (attempt < 1) retryTimer = setTimeout(() => probe(attempt + 1), 50);
        else setDuration(null);
      };
      vid.src = src;
    }

    probe(0);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (liveVid) teardown(liveVid);
    };
  }, [src, skip]);
  return duration;
}

export interface AssetActionProps {
  onCopy: (path: string) => void;
  copyFeedback: CopyFeedback;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAssetToTimeline?: (path: string) => void;
}

export interface AssetCardProps extends AssetActionProps {
  projectId: string;
  asset: string;
  used: boolean;
  duration?: number;
}

function AssetMenu({
  pos,
  asset,
  onClose,
  actions,
}: {
  pos: MenuPos;
  asset: string;
  onClose: () => void;
  actions: AssetActionProps;
}) {
  if (!pos) return null;
  return (
    <ContextMenu
      x={pos.x}
      y={pos.y}
      asset={asset}
      onClose={onClose}
      onCopy={actions.onCopy}
      onDelete={actions.onDelete}
      onRename={actions.onRename}
      onAddAtPlayhead={actions.onAddAssetToTimeline}
    />
  );
}

function Thumbnail({
  asset,
  serveUrl,
  hovered,
}: {
  asset: string;
  serveUrl: string;
  hovered: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const isVideo = VIDEO_EXT.test(asset);
  const isImage = IMAGE_EXT.test(asset);
  if (isImage && !imgError) {
    return (
      <img
        src={serveUrl}
        alt=""
        loading="lazy"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setImgError(true)}
      />
    );
  }
  if (isVideo) {
    return (
      <>
        <span className="absolute inset-0 [&>div]:bg-[var(--st-sub)] [&>img]:object-cover">
          <VideoFrameThumbnail src={serveUrl} />
        </span>
        {hovered && (
          <video
            src={serveUrl}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </>
    );
  }
  return (
    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-[var(--st-t2)]">
      {ext(asset)}
    </span>
  );
}

/** Image / video tile. Click reveals the clip (or previews), drag adds, right-click opens actions. */
export function AssetCard({ projectId, asset, used, duration, ...actions }: AssetCardProps) {
  useLocale();
  const [menu, setMenu] = useState<MenuPos>(null);
  const [hovered, setHovered] = useState(false);
  const serveUrl = resolveMediaPreviewUrl(asset, projectId);
  const isVideo = VIDEO_EXT.test(asset);
  const probed = useProbedDuration(serveUrl, !isVideo || duration != null);
  const durationLabel = formatShortDuration(duration ?? probed ?? undefined);
  const { onPointerDown, onPointerUp, keyHandler } = useAssetActivation(asset, used, projectId);
  const name = filename(asset);

  return (
    <>
      <div
        draggable
        role="button"
        tabIndex={0}
        data-asset-card={asset}
        aria-label={t("media.open", { name: basename(asset) })}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={keyHandler((x, y) => setMenu({ x, y }))}
        onDragStart={(e) => writeAssetDragData(e, asset)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="group m-0 flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-[12px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]"
      >
        <span className="relative block h-24 overflow-hidden rounded-[12px] bg-[var(--st-sub)] transition-shadow group-hover:shadow-[inset_0_0_0_1.5px_var(--st-tx)]">
          <Thumbnail asset={asset} serveUrl={serveUrl} hovered={hovered} />
          {durationLabel ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-[6px] bg-studio-surface px-[5px] text-[11px] font-semibold leading-4 tabular-nums text-studio-text">
              {durationLabel}
            </span>
          ) : null}
          {used ? (
            <span className="absolute right-1.5 top-1.5">
              <PanelTag tone="ok" icon="check" height={22}>
                {t("media.added")}
              </PanelTag>
            </span>
          ) : null}
        </span>
        <div className="truncate text-xs font-medium text-[var(--st-t2)]" title={name}>
          {name}
        </div>
        <CopyChip feedback={actions.copyFeedback} asset={asset} />
      </div>
      <AssetMenu pos={menu} asset={asset} onClose={() => setMenu(null)} actions={actions} />
    </>
  );
}

export interface FontRowProps extends AssetActionProps {
  asset: string;
  used: boolean;
}

/** Font asset row: "A" tile, file name, path, "În uz" tag. Click copies the path. */
export function FontRow({ asset, used, ...actions }: FontRowProps) {
  useLocale();
  const [menu, setMenu] = useState<MenuPos>(null);
  const name = filename(asset);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        draggable
        aria-label={t("media.open", { name: basename(asset) })}
        onClick={() => actions.onCopy(asset)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left + 12, y: rect.top + 12 });
          }
        }}
        onDragStart={(e) => writeAssetDragData(e, asset)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md bg-studio-surface px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_var(--st-bd)] outline-none transition-colors hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] font-display text-[15px] font-semibold shadow-[inset_0_0_0_1px_var(--st-bd)]"
        >
          A
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate text-[13px] font-semibold">{name}</b>
          <span className="truncate text-xs text-[var(--st-t2)]">{asset}</span>
        </span>
        {used ? <PanelTag tone="ok">{t("media.inUse")}</PanelTag> : null}
      </button>
      <CopyChip feedback={actions.copyFeedback} asset={asset} />
      <AssetMenu pos={menu} asset={asset} onClose={() => setMenu(null)} actions={actions} />
    </div>
  );
}
