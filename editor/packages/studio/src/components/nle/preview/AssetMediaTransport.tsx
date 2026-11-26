// Transport for a media file previewed in the asset dialog (St-Preview-AssetOverlay): the same
// row as the preview card, driving the <video>/<audio> element directly. It never touches the
// composition playhead.
import { useEffect, useReducer, useState, useSyncExternalStore, type RefObject } from "react";
import { t, useLocale } from "../../../i18n/translate";
import { secondsToFrame, STUDIO_PREVIEW_FPS } from "../../../player/lib/time";
import {
  formatRate,
  formatTransportReadout,
} from "../../../player/components/transport/transportFormat";
import { SPEED_OPTIONS } from "../../../player/components/SpeedMenu";
import { OutlinePill, PreviewIcon, PreviewIconButton } from "./previewChrome";

type Media = HTMLVideoElement | HTMLAudioElement;

const MEDIA_EVENTS = [
  "timeupdate",
  "play",
  "pause",
  "volumechange",
  "ratechange",
  "loadedmetadata",
  "durationchange",
] as const;

function useMediaTick(mediaRef: RefObject<Media | null>): number {
  const [element, setElement] = useState<Media | null>(null);
  useEffect(() => {
    setElement(mediaRef.current);
  }, [mediaRef]);
  return useSyncExternalStore(
    (notify) => {
      if (!element) return () => {};
      for (const name of MEDIA_EVENTS) element.addEventListener(name, notify);
      return () => {
        for (const name of MEDIA_EVENTS) element.removeEventListener(name, notify);
      };
    },
    () =>
      element
        ? element.currentTime +
          (element.paused ? 0 : 1e6) +
          (element.muted ? 2e6 : 0) +
          element.playbackRate * 1e7 +
          (element.loop ? 1e9 : 0) +
          (Number.isFinite(element.duration) ? element.duration * 1e3 : 0)
        : 0,
  );
}

export function AssetMediaTransport({ mediaRef }: { mediaRef: RefObject<Media | null> }) {
  const locale = useLocale();
  useMediaTick(mediaRef);
  // `loop` has no media event, so the snapshot above does not see a loop toggle; repaint explicitly.
  const [, repaint] = useReducer((count: number) => count + 1, 0);
  const [mode, setMode] = useState<"time" | "frame">("time");
  const media = mediaRef.current;
  const time = media?.currentTime ?? 0;
  const duration = media && Number.isFinite(media.duration) ? media.duration : 0;
  const playing = media ? !media.paused : false;
  const muted = media?.muted ?? true;
  const rate = media?.playbackRate ?? 1;
  const loop = media?.loop ?? false;

  const step = (delta: number) => {
    if (!media) return;
    media.pause();
    const frame = secondsToFrame(media.currentTime) + delta;
    media.currentTime = Math.min(duration, Math.max(0, frame / STUDIO_PREVIEW_FPS));
  };

  return (
    <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1">
      <button
        type="button"
        onClick={() => setMode(mode === "time" ? "frame" : "time")}
        aria-label={mode === "time" ? t("preview.showFrames") : t("preview.showTime")}
        className="-ml-2 h-8 whitespace-nowrap rounded-[10px] px-2 text-[13px] font-semibold tabular-nums text-studio-text hover:bg-[var(--st-sub)]"
      >
        {formatTransportReadout(time, duration, mode)}
      </button>
      <span className="flex items-center gap-1.5">
        <PreviewIconButton label={t("preview.prevFrame")} onClick={() => step(-1)}>
          <PreviewIcon name="prevFrame" />
        </PreviewIconButton>
        <button
          type="button"
          aria-label={playing ? t("preview.pause") : t("preview.play")}
          onClick={() => (playing ? media?.pause() : void media?.play())}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-studio-accent text-studio-on-accent"
        >
          {playing ? (
            <PreviewIcon name="pause" size={18} strokeWidth={3} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7 5v14l12-7z" />
            </svg>
          )}
        </button>
        <PreviewIconButton label={t("preview.nextFrame")} onClick={() => step(1)}>
          <PreviewIcon name="nextFrame" />
        </PreviewIconButton>
      </span>
      <span className="flex items-center justify-end gap-0.5">
        <PreviewIconButton
          label={muted ? t("preview.unmute") : t("preview.mute")}
          aria-pressed={muted}
          onClick={() => {
            if (media) media.muted = !media.muted;
          }}
        >
          <PreviewIcon name={muted ? "muted" : "volume"} />
        </PreviewIconButton>
        <OutlinePill
          height={30}
          className="!px-2.5"
          aria-label={t("preview.speed")}
          onClick={() => {
            if (!media) return;
            const index = SPEED_OPTIONS.indexOf(rate as (typeof SPEED_OPTIONS)[number]);
            media.playbackRate = SPEED_OPTIONS[(index + 1) % SPEED_OPTIONS.length] ?? 1;
          }}
        >
          {formatRate(rate, locale)}
        </OutlinePill>
        <PreviewIconButton
          label={loop ? t("preview.loopOff") : t("preview.loopOn")}
          tone={loop ? "selected" : "plain"}
          aria-pressed={loop}
          onClick={() => {
            if (!media) return;
            media.loop = !media.loop;
            repaint();
          }}
        >
          <PreviewIcon name="loop" />
        </PreviewIconButton>
        {media instanceof HTMLVideoElement && (
          <PreviewIconButton
            label={t("preview.fullscreen")}
            onClick={() => void media.requestFullscreen?.()}
          >
            <PreviewIcon name="fullscreen" />
          </PreviewIconButton>
        )}
      </span>
    </div>
  );
}
