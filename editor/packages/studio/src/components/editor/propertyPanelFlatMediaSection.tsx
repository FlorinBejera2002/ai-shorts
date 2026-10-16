import { FlatMediaCutout } from "./FlatMediaCutout";
import { useState } from "react";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { Check, ClipboardList } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditing";
import {
  type BackgroundRemovalProgress,
  type BackgroundRemovalResult,
  formatNumericValue,
  formatTimingValue,
  parseNumericValue,
} from "./propertyPanelHelpers";
import { FlatSelectRow, FlatSlider } from "./propertyPanelFlatPrimitives";
import { FlatToggle } from "./propertyPanelFlatToggle";
import { AutomationToggle } from "./propertyPanelFxControls";
import { CutMediaApplyControls } from "./CutMediaApplyControls";
import {
  AUDIO_GAIN_FADER_MAX,
  AUDIO_GAIN_FADER_MIN,
  audioFaderPositionToGain,
  formatAudioGain,
  audioGainToFaderPosition,
  audioGainToText,
} from "@hyperframes/core/audio-gain";

// fallow-ignore-next-line complexity
export function FlatMediaSection({
  projectDir,
  element,
  styles,
  onSetStyle,
  onSetAttribute,
  onSetHtmlAttribute,
  onRemoveBackground,
  volumeAutomated,
  onAutomateVolume,
  onRemoveVolumeAutomation,
}: {
  projectDir: string | null;
  element: DomEditSelection;
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  /** A volume lane in the timeline drives the level; the slider cannot. */
  volumeAutomated?: boolean;
  onAutomateVolume?: () => void;
  onRemoveVolumeAutomation?: () => void;
  onRemoveBackground?: (
    inputPath: string,
    options: {
      createBackgroundPlate?: boolean;
      quality?: "fast" | "balanced" | "best";
      onProgress?: (progress: BackgroundRemovalProgress) => void;
    },
  ) => Promise<BackgroundRemovalResult>;
}) {
  const track = useTrackDesignInput();
  const isVideo = element.tagName === "video";
  const isAudio = element.tagName === "audio";
  const isImage = element.tagName === "img";
  const isVisualMedia = isVideo || isImage;
  const el = element.element;

  const volume = parseNumericValue(element.dataAttributes.volume ?? "") ?? 1;
  const volumeFaderPosition = audioGainToFaderPosition(volume);
  const mediaStart =
    Number.parseFloat(
      element.dataAttributes["media-start"] ?? element.dataAttributes["playback-start"] ?? "0",
    ) || 0;
  const playbackRate = Number.parseFloat(element.dataAttributes["playback-rate"] ?? "1") || 1;
  const sourceDuration =
    Number.parseFloat(element.dataAttributes["source-duration"] ?? "") ||
    (el as HTMLMediaElement).duration ||
    0;
  const mediaStartMax = Math.max(30, Math.ceil(sourceDuration || mediaStart + 10));
  const hasLoop = el.hasAttribute("loop");
  const hasMuted = el.hasAttribute("muted");
  const hasAudio = element.dataAttributes["has-audio"] === "true";
  const objectFit = styles["object-fit"] || "contain";
  const objectPosition = styles["object-position"] || "center";

  const srcAttr = el.getAttribute("src") ?? "";
  const [copied, setCopied] = useState(false);
  const absoluteSrc =
    projectDir && srcAttr && !srcAttr.startsWith("http") ? `${projectDir}/${srcAttr}` : srcAttr;
  return (
    <div className="space-y-1.5">
      <CutMediaApplyControls />
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-8 flex-shrink-0 rounded-[3px] bg-panel-surface" />
          <span className="min-w-0 truncate font-mono text-[11px] text-panel-text-0">
            {srcAttr}
          </span>
        </span>
        <button
          type="button"
          data-flat-media-copy="true"
          onClick={() => {
            track("button", "Copy media path");
            void navigator.clipboard.writeText(absoluteSrc).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex flex-shrink-0 items-center gap-1 text-[10px] text-panel-text-3 hover:text-panel-text-1"
        >
          {copied ? <Check size={11} /> : <ClipboardList size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {isVisualMedia && (
        <FlatMediaCutout
          key={srcAttr}
          srcAttr={srcAttr}
          isVideo={isVideo}
          onSetAttribute={onSetAttribute}
          onSetHtmlAttribute={onSetHtmlAttribute}
          onRemoveBackground={onRemoveBackground}
        />
      )}
      {(isVideo || isAudio) && (
        <>
          {/* The slider is disabled while a lane owns the level: a value set
              here would be overwritten by the envelope on the next tick. The
              toggle beside it carries the tooltip. */}
          <div
            className="hf-volume-row flex items-center gap-1"
            data-volume-automated={volumeAutomated ? "" : undefined}
          >
            <div className="min-w-0 flex-1">
              <FlatSlider
                label="Volume"
                value={volumeFaderPosition}
                min={AUDIO_GAIN_FADER_MIN}
                max={AUDIO_GAIN_FADER_MAX}
                tier={volume === 1 ? "default" : "explicitCustom"}
                displayValue={audioGainToText(volume)}
                disabled={volumeAutomated}
                centerTick
                onCommit={(next) =>
                  void onSetAttribute("volume", formatAudioGain(audioFaderPositionToGain(next)))
                }
              />
            </div>
            <AutomationToggle
              paramKey="volume"
              label="Volume"
              automated={Boolean(volumeAutomated)}
              onAutomate={onAutomateVolume ? () => onAutomateVolume() : undefined}
              onRemoveAutomation={
                onRemoveVolumeAutomation ? () => onRemoveVolumeAutomation() : undefined
              }
            />
          </div>
          <FlatSlider
            label="Rate"
            value={playbackRate * 100}
            min={25}
            max={300}
            tier={playbackRate === 1 ? "default" : "explicitCustom"}
            displayValue={`${formatNumericValue(playbackRate)}x`}
            onCommit={(next) =>
              void onSetAttribute("playback-rate", formatNumericValue(next / 100))
            }
          />
          <FlatSlider
            label="Media start"
            value={Math.round(mediaStart * 100)}
            min={0}
            max={mediaStartMax * 100}
            tier={mediaStart === 0 ? "default" : "explicitCustom"}
            displayValue={formatTimingValue(mediaStart)}
            onCommit={(next) => void onSetAttribute("media-start", (next / 100).toFixed(2))}
          />
          <FlatToggle
            label="Loop"
            checked={hasLoop}
            onChange={(next) => void onSetHtmlAttribute("loop", next ? "true" : null)}
          />
          <FlatToggle
            label="Muted"
            checked={hasMuted}
            onChange={(next) => void onSetHtmlAttribute("muted", next ? "true" : null)}
          />
          {isVideo && (
            <FlatToggle
              label="Has audio track"
              checked={hasAudio}
              onChange={(next) => {
                if (next) {
                  void onSetAttribute("has-audio", "true");
                  void onSetHtmlAttribute("muted", null);
                } else {
                  void onSetAttribute("has-audio", "");
                  void onSetHtmlAttribute("muted", "true");
                }
              }}
            />
          )}
        </>
      )}
      {isVisualMedia && (
        <>
          <FlatSelectRow
            label="Fit"
            value={objectFit}
            options={["contain", "cover", "fill", "none", "scale-down"]}
            tier={objectFit === "contain" ? "default" : "explicitCustom"}
            onChange={(next) => void onSetStyle("object-fit", next)}
          />
          <FlatSelectRow
            label="Position"
            value={objectPosition}
            options={[
              "center",
              "top",
              "bottom",
              "left",
              "right",
              "left top",
              "right top",
              "left bottom",
              "right bottom",
            ]}
            tier={objectPosition === "center" ? "default" : "explicitCustom"}
            onChange={(next) => void onSetStyle("object-position", next)}
          />
        </>
      )}
    </div>
  );
}
