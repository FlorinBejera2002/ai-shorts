import { useRef, useEffect, memo, useCallback } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { liveTime, usePlayerStore } from "../store/playerStore";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { t, useLocale } from "../../i18n/translate";
import { useLatestRef } from "../../hooks/useLatestRef";
import { useMountEffect } from "../../hooks/useMountEffect";
import { PreviewIcon, PreviewIconButton } from "../../components/nle/preview/previewChrome";
import { setPreviewPanel } from "../../components/nle/preview/previewUiStore";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { SPEED_OPTIONS, SpeedMenu } from "./SpeedMenu";
import { VolumeControl } from "./VolumeControl";
import {
  formatRate,
  formatTransportReadout,
  stepTransportFrame,
} from "./transport/transportFormat";

gsap.registerPlugin(MorphSVGPlugin);

// Standard play and pause glyphs share a coordinate space for MorphSVG.
const PLAY_BLADE_D = "M56 27L90 49.5L56 72Z";
const PAUSE_BARS_D = "M56 28H67V71H56Z M73 28H84V71H73Z";

// Morph the play blade <-> pause bars on toggle via GSAP MorphSVG. Both glyphs
// are one path whose `d` tweens; the initial render matches `playing` with no
// animation, and prefers-reduced-motion snaps instead of tweening.
function PlayPauseMorphIcon({ playing, size = 18 }: { playing: boolean; size?: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const isFirstRun = useRef(true);
  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const target = playing ? PAUSE_BARS_D : PLAY_BLADE_D;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (isFirstRun.current || reduceMotion) {
      isFirstRun.current = false;
      gsap.set(el, { morphSVG: target });
      return;
    }
    const tween = gsap.to(el, { duration: 0.28, ease: "power2.inOut", morphSVG: target });
    return () => {
      tween.kill();
    };
  }, [playing]);
  return (
    <svg width={size} height={size} viewBox="46 21 54 56" fill="currentColor" aria-hidden="true">
      <path ref={pathRef} d={playing ? PAUSE_BARS_D : PLAY_BLADE_D} />
    </svg>
  );
}

export type TransportLayout = "desktop" | "phone" | "fullscreen";

interface PlayerControlsProps {
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  disabled?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** desktop: St-Preview transport row; phone: St-M-Main row; fullscreen: the dark bar. */
  layout?: TransportLayout;
}

/** Live "0:08 / 0:45" readout, written straight to the DOM on every frame. */
function useLiveReadout(duration: number, mode: "time" | "frame", layout: TransportLayout) {
  const readoutRef = useRef<HTMLSpanElement>(null);
  const currentTimeRef = useRef(0);
  const stateRef = useLatestRef({ duration, mode });

  const paint = useCallback(() => {
    const node = readoutRef.current;
    if (!node) return;
    const { duration: total, mode: display } = stateRef.current;
    node.textContent = formatTransportReadout(currentTimeRef.current, total, display);
  }, [stateRef]);

  // Each layout mounts its own readout node, so repaint whenever the layout changes.
  useEffect(paint, [duration, mode, layout, paint]);

  useMountEffect(() => {
    const update = (time: number) => {
      currentTimeRef.current = time;
      paint();
    };
    const unsubscribe = liveTime.subscribe(update);
    update(usePlayerStore.getState().currentTime);
    return unsubscribe;
  });

  return { readoutRef, currentTimeRef };
}

export const PlayerControls = memo(function PlayerControls({
  onTogglePlay,
  onSeek,
  disabled = false,
  isFullscreen = false,
  onToggleFullscreen,
  layout = "desktop",
}: PlayerControlsProps) {
  const locale = useLocale();
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const timelineReady = usePlayerStore((s) => s.timelineReady);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const audioMuted = usePlayerStore((s) => s.audioMuted);
  const audioVolume = usePlayerStore((s) => s.audioVolume);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const inPoint = usePlayerStore((s) => s.inPoint);
  const outPoint = usePlayerStore((s) => s.outPoint);
  const timeDisplayMode = usePlayerStore((s) => s.timeDisplayMode);
  const { setPlaybackRate, setAudioMuted, setAudioVolume, setLoopEnabled } =
    usePlayerStore.getState();
  const { setInPoint, setOutPoint, setTimeDisplayMode } = usePlayerStore.getState();

  const { readoutRef, currentTimeRef } = useLiveReadout(duration, timeDisplayMode, layout);
  const controlsDisabled = disabled || !timelineReady;

  const stepFrame = (delta: number) => {
    onSeek(stepTransportFrame(currentTimeRef.current, delta, duration));
  };
  const togglePlay = () => {
    trackStudioEvent("playback", { action: isPlaying ? "pause" : "play" });
    onTogglePlay();
  };
  const playLabel = isPlaying ? t("preview.pause") : t("preview.play");

  if (layout === "fullscreen") {
    return (
      <div className="flex h-14 w-full items-center gap-2 rounded-full bg-[color-mix(in_srgb,black_62%,transparent)] px-2 text-white">
        <button
          type="button"
          aria-label={playLabel}
          onClick={togglePlay}
          disabled={controlsDisabled}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
        >
          <PlayPauseMorphIcon playing={isPlaying} size={16} />
        </button>
        <span
          ref={readoutRef}
          className="whitespace-nowrap text-[13px] font-semibold tabular-nums"
        />
        <span className="flex-1" />
        <VolumeControl
          audioMuted={audioMuted}
          audioVolume={audioVolume}
          disabled={controlsDisabled}
          setAudioMuted={setAudioMuted}
          setAudioVolume={setAudioVolume}
          size={40}
          inverted
        />
        <button
          type="button"
          onClick={() => {
            const index = SPEED_OPTIONS.indexOf(playbackRate as (typeof SPEED_OPTIONS)[number]);
            setPlaybackRate(SPEED_OPTIONS[(index + 1) % SPEED_OPTIONS.length] ?? 1);
          }}
          aria-label={t("preview.speed")}
          className="flex h-7 flex-none items-center rounded-full bg-[color-mix(in_srgb,white_16%,transparent)] px-2.5 text-xs font-semibold"
        >
          {formatRate(playbackRate, locale)}
        </button>
      </div>
    );
  }

  const readoutButton = (
    <button
      type="button"
      onClick={() => setTimeDisplayMode(timeDisplayMode === "time" ? "frame" : "time")}
      disabled={disabled}
      aria-label={timeDisplayMode === "time" ? t("preview.showFrames") : t("preview.showTime")}
      title={timeDisplayMode === "time" ? t("preview.showFrames") : t("preview.showTime")}
      className={`h-8 whitespace-nowrap rounded-[10px] text-[13px] font-semibold tabular-nums text-studio-text outline-none hover:bg-[var(--st-sub)] focus-visible:ring-2 focus-visible:ring-[var(--st-btn)] disabled:pointer-events-none ${
        layout === "phone" ? "-ml-1 px-1 text-left" : "-ml-2 min-w-0 px-2"
      }`}
    >
      <span ref={readoutRef} />
    </button>
  );

  const frameStep = (
    <span className={`flex items-center ${layout === "phone" ? "gap-1" : "gap-1.5"}`}>
      <PreviewIconButton
        label={t("preview.prevFrame")}
        size={layout === "phone" ? 44 : 36}
        onClick={() => stepFrame(-1)}
        disabled={controlsDisabled}
      >
        <PreviewIcon name="prevFrame" />
      </PreviewIconButton>
      <button
        type="button"
        aria-label={playLabel}
        title={playLabel}
        onClick={togglePlay}
        disabled={controlsDisabled}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-studio-accent text-studio-on-accent outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-btn)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
      >
        <PlayPauseMorphIcon playing={isPlaying} />
      </button>
      <PreviewIconButton
        label={t("preview.nextFrame")}
        size={layout === "phone" ? 44 : 36}
        onClick={() => stepFrame(1)}
        disabled={controlsDisabled}
      >
        <PreviewIcon name="nextFrame" />
      </PreviewIconButton>
    </span>
  );

  if (layout === "phone") {
    return (
      <div
        className="flex h-12 items-center justify-between gap-2 px-2"
        aria-disabled={disabled || undefined}
      >
        {readoutButton}
        {frameStep}
        <VolumeControl
          audioMuted={audioMuted}
          audioVolume={audioVolume}
          disabled={controlsDisabled}
          setAudioMuted={setAudioMuted}
          setAudioVolume={setAudioVolume}
          onOpenSheet={() => setPreviewPanel("phonePlayback")}
          size={44}
        />
      </div>
    );
  }

  return (
    <div
      className="grid h-11 flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
      aria-disabled={disabled || undefined}
    >
      {readoutButton}
      {frameStep}
      <span className="flex min-w-0 items-center justify-end gap-0.5">
        <VolumeControl
          audioMuted={audioMuted}
          audioVolume={audioVolume}
          disabled={controlsDisabled}
          setAudioMuted={setAudioMuted}
          setAudioVolume={setAudioVolume}
        />
        <SpeedMenu
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          disabled={disabled}
        />
        <PreviewIconButton
          label={loopEnabled ? t("preview.loopOff") : t("preview.loopOn")}
          tone={loopEnabled ? "selected" : "plain"}
          aria-pressed={loopEnabled}
          disabled={disabled}
          onClick={() => {
            trackStudioEvent("playback", { action: "loop_toggle", enabled: !loopEnabled });
            setLoopEnabled(!loopEnabled);
          }}
        >
          <PreviewIcon name="loop" />
        </PreviewIconButton>
        {onToggleFullscreen && (
          <PreviewIconButton
            label={isFullscreen ? t("preview.exitFullscreen") : t("preview.fullscreen")}
            title={`${isFullscreen ? t("preview.exitFullscreen") : t("preview.fullscreen")} (F)`}
            onClick={() => {
              trackStudioEvent("playback", { action: "fullscreen_toggle", active: !isFullscreen });
              onToggleFullscreen();
            }}
          >
            <PreviewIcon name={isFullscreen ? "exitFullscreen" : "fullscreen"} />
          </PreviewIconButton>
        )}
        <ShortcutsPanel
          disabled={disabled}
          duration={duration}
          inPoint={inPoint}
          outPoint={outPoint}
          setInPoint={setInPoint}
          setOutPoint={setOutPoint}
          onSeek={onSeek}
        />
      </span>
    </div>
  );
});
