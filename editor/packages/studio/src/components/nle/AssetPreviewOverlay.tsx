/**
 * Asset preview dialog (St-Preview-AssetOverlay, St-M-Preview-AssetOverlay).
 *
 * Shown when the user clicks an asset card that has NOT yet been added to the
 * timeline. Displays the media (image / video / audio) in a 680px dialog over a
 * scrim without modifying the composition (no undo entry, no file mutation).
 * Video and audio get the preview's own transport.
 *
 * Dismiss: close button, Escape key, click on the scrim, or any playhead
 * activity (starting playback / seeking) — the canvas refocuses.
 * Switching to another not-added asset replaces the current preview.
 */
import { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { VIDEO_EXT, IMAGE_EXT } from "../../utils/mediaTypes";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { usePlayerStore } from "../../player/store/playerStore";
import { shouldDismissAssetPreview } from "../../utils/assetPreviewDismiss";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import { t, useLocale } from "../../i18n/translate";
import { DIALOG_SHADOW, PreviewIcon, PreviewIconButton } from "./preview/previewChrome";
import { AssetMediaTransport } from "./preview/AssetMediaTransport";

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

type AssetKind = "image" | "video" | "audio";

function resolveAssetKind(path: string): AssetKind {
  if (VIDEO_EXT.test(path)) return "video";
  if (IMAGE_EXT.test(path)) return "image";
  return "audio";
}

/** The media for a previewed asset, chosen by kind, in the 16px-radius black frame. */
function AssetPreviewMedia({
  kind,
  serveUrl,
  name,
}: {
  kind: AssetKind;
  serveUrl: string;
  name: string;
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const frame =
    "relative flex h-[min(360px,45dvh)] items-center justify-center overflow-hidden rounded-[16px] bg-black";
  if (kind === "image") {
    return (
      <div className={frame}>
        <img src={serveUrl} alt={name} className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <>
      <div className={frame}>
        {kind === "video" ? (
          <video
            ref={(node) => {
              mediaRef.current = node;
            }}
            src={serveUrl}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <PreviewIcon name="music" size={40} strokeWidth={1.5} className="text-white" />
            <audio
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={serveUrl}
              className="hidden"
            />
          </>
        )}
      </div>
      <AssetMediaTransport mediaRef={mediaRef} />
    </>
  );
}

export function AssetPreviewOverlay() {
  useLocale();
  const previewAsset = useAssetPreviewStore((s) => s.previewAsset);
  const previewProjectId = useAssetPreviewStore((s) => s.previewProjectId);
  const clearPreviewAsset = useAssetPreviewStore((s) => s.clearPreviewAsset);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") clearPreviewAsset();
    },
    [clearPreviewAsset],
  );

  useEffect(() => {
    if (!previewAsset) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset, handleKeyDown]);

  // The canvas refocuses on any playhead activity: starting playback or a
  // seek/scrub away from where the playhead sat when the preview opened
  // dismisses it. openedTime is captured per preview open (previewAsset dep),
  // so a stale render can never dismiss against the wrong reference time.
  useEffect(() => {
    if (!previewAsset) return;
    const opened = usePlayerStore.getState();
    const openedTime = opened.currentTime;
    // Level-triggered, not edge-triggered: a preview opened while playback is
    // ALREADY running (the RAF loop bypasses the store) or while a seek is
    // already in flight gets no store change to react to, so evaluate the
    // current state once, through the same shared predicate the subscription
    // uses. openedTime is this snapshot's own currentTime, so the
    // time-diverged branch can't false-positive at open — only the
    // isPlaying / requestedSeekTime branches can fire here.
    if (shouldDismissAssetPreview(openedTime, opened)) {
      clearPreviewAsset();
      return;
    }
    return usePlayerStore.subscribe((state) => {
      if (shouldDismissAssetPreview(openedTime, state)) clearPreviewAsset();
    });
  }, [previewAsset, clearPreviewAsset]);

  if (!previewAsset || !previewProjectId) return null;

  const serveUrl = resolveMediaPreviewUrl(previewAsset, previewProjectId);
  const name = basename(previewAsset);
  const title = t("preview.assetPreview", { name });

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[150] flex items-end justify-center bg-[var(--st-ov)] sm:items-center sm:p-4"
      onClick={clearPreviewAsset}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`flex w-full flex-col gap-5 rounded-t-sheet bg-studio-surface p-6 text-studio-text sm:w-[680px] sm:max-w-full sm:rounded-sheet ${DIALOG_SHADOW}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-semibold leading-7">
            {title}
          </h2>
          <PreviewIconButton
            label={t("preview.closeAssetPreview")}
            onClick={(e) => {
              e.stopPropagation();
              clearPreviewAsset();
            }}
          >
            <PreviewIcon name="close" />
          </PreviewIconButton>
        </div>
        <AssetPreviewMedia
          key={serveUrl}
          kind={resolveAssetKind(previewAsset)}
          serveUrl={serveUrl}
          name={name}
        />
      </div>
    </div>,
    document.body,
  );
}
