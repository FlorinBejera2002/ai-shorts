// Audio asset row. "media" (St-Shell-MediaRows): play button, name, live level bars, type and
// "În uz" tags. "music" (St-Music): round play badge, name with playback progress or
// "duration · type", and "Adaugă" (adds at the playhead) or the "Adăugat" tag.
import { useState, useRef, useEffect, useCallback } from "react";
import { classifyWebAudioMediaRoute } from "@hyperframes/core/runtime/web-audio-route";
import { ContextMenu } from "./AssetContextMenu";
import {
  basename,
  filename,
  formatShortDuration,
  getAudioSubtype,
  type CopyFeedback,
} from "./assetHelpers";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import { t, useLocale } from "../../i18n/translate";
import { PanelIcon } from "./panelIcons";
import { PanelPill, PanelProgress, PanelTag } from "./panelKit";
import { CopyChip, writeAssetDragData } from "./AssetCard";
import { useAssetActivation } from "./useAssetActivation";

// Only one preview plays at a time; starting a row stops the previous one.
let stopCurrentPreview: (() => void) | null = null;

const BAR_COUNT = 24;

interface PreviewState {
  playing: boolean;
  bars: number[];
  progress: number;
}

/** Plays the asset through an <audio> element, with analyser bars when Web Audio may tap it. */
function useAudioPreview(serveUrl: string) {
  const [state, setState] = useState<PreviewState>({ playing: false, bars: [], progress: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    cancelAnimationFrame(animRef.current);
    setState({ playing: false, bars: [], progress: 0 });
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      audioRef.current?.pause();
      void actxRef.current?.close();
      if (stopCurrentPreview === stop) stopCurrentPreview = null;
    };
  }, [stop]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const analyser = analyserRef.current;
    let bars: number[] = [];
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      bars = Array.from({ length: BAR_COUNT }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
        return sum / step / 255;
      });
    }
    const progress = audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
    setState({ playing: true, bars, progress });
    animRef.current = requestAnimationFrame(tick);
  }, []);

  const ensureElement = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.onended = () => {
      cancelAnimationFrame(animRef.current);
      setState({ playing: false, bars: [], progress: 0 });
    };
    // `src` before classifying: the check reads currentSrc/src.
    el.src = serveUrl;
    audioRef.current = el;
    // A cross-origin element routed through createMediaElementSource plays silence
    // (Web Audio spec, #3458). Classify first; without the graph only the bars are lost.
    if (classifyWebAudioMediaRoute(el).kind === "web-audio") {
      const actx = new AudioContext();
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      const source = actx.createMediaElementSource(el);
      source.connect(analyser);
      analyser.connect(actx.destination);
      actxRef.current = actx;
      analyserRef.current = analyser;
    }
    return el;
  }, [serveUrl]);

  const toggle = useCallback(async () => {
    if (state.playing) {
      stop();
      if (stopCurrentPreview === stop) stopCurrentPreview = null;
      return;
    }
    if (stopCurrentPreview && stopCurrentPreview !== stop) stopCurrentPreview();
    stopCurrentPreview = stop;
    const el = ensureElement();
    if (actxRef.current?.state === "suspended") await actxRef.current.resume();
    el.currentTime = 0;
    try {
      await el.play();
      setState({ playing: true, bars: [], progress: 0 });
      animRef.current = requestAnimationFrame(tick);
    } catch {
      // Playback refused (decode failure): reset instead of a stuck state.
      stop();
      if (stopCurrentPreview === stop) stopCurrentPreview = null;
    }
  }, [state.playing, stop, ensureElement, tick]);

  return { ...state, toggle };
}

export interface AudioRowProps {
  projectId: string;
  asset: string;
  used: boolean;
  meta?: { description?: string; duration?: number };
  onCopy: (path: string) => void;
  copyFeedback: CopyFeedback;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAssetToTimeline?: (path: string) => void;
  variant?: "media" | "music";
}

function LevelBars({ bars }: { bars: number[] }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[18px] items-end gap-[2px] overflow-hidden rounded-[6px] bg-[var(--st-sub)] px-1"
    >
      {bars.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px] bg-[var(--st-t3)]"
          style={{ height: `${Math.max(12, v * 100)}%` }}
        />
      ))}
    </span>
  );
}

// fallow-ignore-next-line complexity
export function AudioRow({
  projectId,
  asset,
  used,
  meta,
  onCopy,
  copyFeedback,
  onDelete,
  onRename,
  onAddAssetToTimeline,
  variant = "media",
}: AudioRowProps) {
  useLocale();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const serveUrl = resolveMediaPreviewUrl(asset, projectId);
  const preview = useAudioPreview(serveUrl);
  const { activate, keyHandler } = useAssetActivation(asset, used, projectId);
  const name = variant === "music" ? basename(asset) : filename(asset);
  const subtype = getAudioSubtype(asset);
  const durationLabel = formatShortDuration(meta?.duration);
  const music = variant === "music";
  const playLabel = `${preview.playing ? t("media.pause") : t("media.play")} ${name}`;

  const playButton = (
    <button
      type="button"
      aria-label={playLabel}
      title={playLabel}
      aria-pressed={preview.playing}
      onClick={() => void preview.toggle()}
      className={`flex flex-none items-center justify-center rounded-full transition-colors ${
        music ? "h-9 w-9" : "h-8 w-8"
      } ${
        music && !preview.playing
          ? "bg-[var(--st-sub)] text-studio-text"
          : music
            ? "bg-studio-selected text-studio-on-selected"
            : "bg-studio-accent text-studio-on-accent"
      }`}
    >
      <PanelIcon name={preview.playing ? "pause" : "play"} size={music ? 16 : 14} />
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {/* A plain container: the name area, play and add are sibling buttons, so each one is its
          own control for screen readers and no click has to be filtered out of another. */}
      <div
        draggable
        onDragStart={(e) => writeAssetDragData(e, asset)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)] transition-colors hover:bg-[var(--st-sub)] ${
          music ? "p-2" : "px-3 py-2.5"
        }`}
      >
        {playButton}
        <button
          type="button"
          aria-label={t("media.open", { name })}
          onClick={activate}
          onKeyDown={keyHandler((x, y) => setMenu({ x, y }))}
          className={`flex min-w-0 flex-1 flex-col self-stretch justify-center rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${music ? "gap-[5px]" : "gap-1"}`}
        >
          <b className="truncate text-[13px] font-semibold">{name}</b>
          {music ? (
            preview.playing ? (
              <PanelProgress value={preview.progress} label={t("panelAudio.progress")} />
            ) : (
              <span className="truncate text-xs tabular-nums text-[var(--st-t2)]">
                {durationLabel ? `${durationLabel} · ${subtype}` : subtype}
              </span>
            )
          ) : (
            <LevelBars bars={preview.bars.length ? preview.bars : Array(BAR_COUNT).fill(0)} />
          )}
        </button>
        {music ? (
          used ? (
            <PanelTag tone="ok" icon="check" height={28}>
              {t("panelAudio.added")}
            </PanelTag>
          ) : onAddAssetToTimeline ? (
            <PanelPill
              size={30}
              icon="plus"
              aria-label={t("panelAudio.addName", { name })}
              onClick={() => onAddAssetToTimeline(asset)}
            >
              {t("panelAudio.add")}
            </PanelPill>
          ) : null
        ) : (
          <span className="flex flex-none flex-col items-end gap-1">
            <PanelTag tone="neutral">{subtype}</PanelTag>
            {used ? <PanelTag tone="ok">{t("media.inUse")}</PanelTag> : null}
          </span>
        )}
      </div>
      <CopyChip feedback={copyFeedback} asset={asset} />
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          asset={asset}
          onClose={() => setMenu(null)}
          onCopy={onCopy}
          onDelete={onDelete}
          onRename={onRename}
          onAddAtPlayhead={onAddAssetToTimeline}
        />
      )}
    </div>
  );
}
