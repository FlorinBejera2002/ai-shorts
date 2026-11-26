import { useState } from "react";
import { FfmpegRequiredNotice } from "./FfmpegRequiredNotice";
import type { FfmpegStatus } from "./useFfmpegStatus";
import { OutputButton } from "../output/OutputButton";
import { OutputSection, OutputSegment, OutputSelect } from "../output/OutputFields";
import { FormatInfoTooltip } from "./FormatInfoTooltip";
import type { RenderFormat } from "./formatInfo";
import {
  SCALE_OPTION_ORDER,
  resolveResolution,
  scaleApplies,
  scaleOptionLabel,
  type CompositionDimensions,
  type RenderScale,
} from "./renderScale";
import {
  getPersistedRenderSettings,
  persistRenderSettings,
  type RenderHdrMode,
} from "./renderSettings";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

export type StartRenderHandler = (
  format: RenderFormat,
  quality: Quality,
  resolution: ReturnType<typeof resolveResolution>,
  fps: 24 | 30 | 60,
  hdrMode: RenderHdrMode,
) => void | Promise<void>;

export type Quality = "draft" | "standard" | "high";

const QUALITY_OPTIONS: { value: Quality; labelKey: MessageKey; titleKey: MessageKey }[] = [
  { value: "draft", labelKey: "output.qualityDraft", titleKey: "output.qualityDraftTitle" },
  {
    value: "standard",
    labelKey: "output.qualityStandard",
    titleKey: "output.qualityStandardTitle",
  },
  { value: "high", labelKey: "output.qualityHigh", titleKey: "output.qualityHighTitle" },
];

const FORMAT_OPTIONS: { value: RenderFormat; labelKey: MessageKey }[] = [
  { value: "mp4", labelKey: "output.formatMp4Info" },
  { value: "mov", labelKey: "output.formatMovLabel" },
  { value: "webm", labelKey: "output.formatWebmLabel" },
];

const FPS_OPTIONS: (24 | 30 | 60)[] = [24, 30, 60];

function formatEta(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export interface RenderExportFormProps {
  onStartRender: StartRenderHandler;
  isRendering: boolean;
  compositionDimensions?: CompositionDimensions | null;
  lastRenderDurationMs?: number;
  ffmpeg: FfmpegStatus | null;
  ffmpegChecking: boolean;
  onRecheckFfmpeg: () => void;
}

/** Export options and the Export button at the top of the Renders tab. */
export function RenderExportForm({
  onStartRender,
  isRendering,
  compositionDimensions,
  lastRenderDurationMs,
  ffmpeg,
  ffmpegChecking,
  onRecheckFfmpeg,
}: RenderExportFormProps) {
  useLocale();
  const persisted = getPersistedRenderSettings();
  const [format, setFormat] = useState<RenderFormat>(persisted.format);
  const [quality, setQuality] = useState<Quality>(persisted.quality);
  const [resolution, setResolution] = useState<RenderScale>("auto");
  const [fps, setFps] = useState<24 | 30 | 60>(persisted.fps);
  const [hdrMode, setHdrMode] = useState<RenderHdrMode>(persisted.hdrMode);

  // Only a definite "not installed" blocks Export. A null status means the
  // probe gave no answer, and refusing to export on no answer would break
  // setups that are perfectly fine. Holding the narrowed value rather than a
  // boolean keeps the notice from re-testing what this line already decided.
  const missingFfmpeg = ffmpeg && !ffmpeg.ok ? ffmpeg : null;

  // MOV (ProRes) is a fixed-quality codec — quality selector has no effect.
  const showQuality = format !== "mov";

  const changeFormat = (next: RenderFormat) => {
    const nextHdrMode = next === "mp4" ? hdrMode : "force-sdr";
    setFormat(next);
    setHdrMode(nextHdrMode);
    persistRenderSettings(next, quality, fps, nextHdrMode);
  };
  const changeQuality = (next: Quality) => {
    setQuality(next);
    persistRenderSettings(format, next, fps, hdrMode);
  };
  const startExport = () => {
    // Disabled while rendering; this guard also stops a double-click in the same frame from
    // enqueueing two renders.
    if (isRendering || missingFfmpeg) return;
    const outputResolution = resolveResolution(resolution, compositionDimensions);
    trackStudioEvent("render_start", { format, quality, resolution: outputResolution, fps });
    void onStartRender(
      format,
      quality,
      outputResolution,
      fps,
      format === "mp4" ? hdrMode : "force-sdr",
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {missingFfmpeg && (
        <FfmpegRequiredNotice
          status={missingFfmpeg}
          checking={ffmpegChecking}
          onRecheck={onRecheckFfmpeg}
        />
      )}
      <OutputSection title={t("output.format")} right={<FormatInfoTooltip format={format} />}>
        <OutputSegment
          label={t("output.format")}
          options={FORMAT_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey),
          }))}
          value={format}
          onChange={changeFormat}
          height={36}
          fontSize={12}
          padX={6}
          disabled={isRendering}
        />
      </OutputSection>
      <div className="grid grid-cols-2 gap-2.5">
        <OutputSection title={t("output.resolution")}>
          <OutputSelect
            aria-label={t("output.resolutionAria")}
            value={resolution}
            onChange={(e) => setResolution(e.target.value as RenderScale)}
            disabled={isRendering}
          >
            {SCALE_OPTION_ORDER.map((value) => (
              <option
                key={value}
                value={value}
                disabled={!scaleApplies(value, compositionDimensions)}
              >
                {value === "auto"
                  ? t("output.scaleAuto")
                  : scaleOptionLabel(value, compositionDimensions)}
              </option>
            ))}
          </OutputSelect>
        </OutputSection>
        <OutputSection title={t("output.frameRate")}>
          <OutputSelect
            aria-label={t("output.frameRateAria")}
            value={fps}
            onChange={(e) => {
              const next = Number(e.target.value) as 24 | 30 | 60;
              setFps(next);
              persistRenderSettings(format, quality, next, hdrMode);
            }}
            disabled={isRendering}
          >
            {FPS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t("output.fpsOption", { fps: value })}
              </option>
            ))}
          </OutputSelect>
        </OutputSection>
      </div>
      {showQuality && (
        <OutputSection title={t("output.quality")}>
          <OutputSegment
            label={t("output.quality")}
            options={QUALITY_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
              title: t(option.titleKey),
            }))}
            value={quality}
            onChange={changeQuality}
            height={36}
            fontSize={12}
            padX={6}
            disabled={isRendering}
          />
        </OutputSection>
      )}
      <OutputSection title={t("output.dynamicRange")}>
        <div className="flex flex-col gap-1.5">
          <OutputSelect
            aria-label={t("output.dynamicRangeAria")}
            value={format === "mp4" ? hdrMode : "force-sdr"}
            onChange={(event) => {
              const next = event.target.value as RenderHdrMode;
              setHdrMode(next);
              persistRenderSettings(format, quality, fps, next);
            }}
            disabled={isRendering || format !== "mp4"}
          >
            <option value="auto">{t("output.dynamicRangeAuto")}</option>
            <option value="force-sdr">{t("output.dynamicRangeSdr")}</option>
            <option value="force-hdr">{t("output.dynamicRangeHdr")}</option>
          </OutputSelect>
          {format !== "mp4" ? (
            <span className="text-xs font-medium text-[var(--st-t2)]">
              {t("output.dynamicRangeNeedsMp4")}
            </span>
          ) : null}
        </div>
      </OutputSection>
      <div className="flex flex-col gap-2">
        <OutputButton
          variant="primary"
          height={44}
          icon={isRendering ? "refresh" : "download"}
          disabled={isRendering || missingFfmpeg !== null}
          title={missingFfmpeg ? t("output.installFfmpegFirst") : undefined}
          onClick={startExport}
          className="w-full"
        >
          {isRendering ? t("output.rendering") : t("output.export")}
        </OutputButton>
        {lastRenderDurationMs !== undefined && !isRendering && (
          <span className="text-center text-xs font-medium text-[var(--st-t2)]">
            {t("output.lastRender", { duration: formatEta(lastRenderDurationMs) })}
          </span>
        )}
      </div>
    </div>
  );
}
