import { useEffect, useState } from "react";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import {
  type BackgroundRemovalProgress,
  type BackgroundRemovalResult,
  stripQueryAndHash,
} from "./propertyPanelHelpers";
import { FlatField, FlatToggleSegment } from "./propertyPanelFlatTextControls";
import { InspectorAction, InspectorSwitchRow } from "./inspectorControls";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

// St-Inspector-Cutout: quality segment, background plate switch, progress and the action.
export function FlatMediaCutout({
  srcAttr,
  isVideo,
  onSetAttribute,
  onSetHtmlAttribute,
  onRemoveBackground,
}: {
  srcAttr: string;
  isVideo: boolean;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onRemoveBackground?: (
    inputPath: string,
    options: {
      createBackgroundPlate?: boolean;
      quality?: "fast" | "balanced" | "best";
      onProgress?: (progress: BackgroundRemovalProgress) => void;
    },
  ) => Promise<BackgroundRemovalResult>;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeProgress, setRemoveProgress] = useState<BackgroundRemovalProgress | null>(null);
  const [createPlate, setCreatePlate] = useState(false);
  const [quality, setQuality] = useState<"fast" | "balanced" | "best">("balanced");

  const projectSrc =
    srcAttr && !/^(?:https?:|data:|blob:)/i.test(srcAttr)
      ? stripQueryAndHash(srcAttr.startsWith("./") ? srcAttr.slice(2) : srcAttr)
      : "";
  const canRemoveBackground = Boolean(onRemoveBackground && projectSrc);

  useEffect(() => {
    setRemoveProgress(null);
    setCreatePlate(false);
  }, [srcAttr]);

  const applyCutoutResult = async (result: BackgroundRemovalResult) => {
    await onSetHtmlAttribute("src", result.outputPath);
    if (isVideo) {
      await onSetAttribute("has-audio", "");
      await onSetHtmlAttribute("muted", "true");
    }
  };

  const runBackgroundRemoval = async () => {
    if (!onRemoveBackground || !projectSrc || removeBusy) return;
    track("button", "Remove background");
    setRemoveBusy(true);
    setRemoveProgress({ status: "processing", progress: 0, stage: t("cutout.working") });
    try {
      const result = await onRemoveBackground(projectSrc, {
        createBackgroundPlate: isVideo && createPlate,
        quality,
        onProgress: setRemoveProgress,
      });
      await applyCutoutResult(result);
      setRemoveProgress({ status: "complete", progress: 100, stage: t("cutout.done"), ...result });
    } catch (error) {
      setRemoveProgress({
        status: "failed",
        progress: 0,
        stage: t("cutout.failed"),
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRemoveBusy(false);
    }
  };

  const status = removeProgress?.status;
  const statusLabel =
    status === "failed"
      ? t("cutout.failed")
      : status === "complete"
        ? t("cutout.done")
        : t("cutout.working");
  return (
    <section
      aria-label={t("cutout.title")}
      data-cutout-format={isVideo ? "WebM" : "PNG"}
      className="flex flex-col gap-3"
    >
      <h3 className="text-[13px] font-semibold text-studio-text">{t("cutout.title")}</h3>
      <FlatField label={t("cutout.quality")}>
        <FlatToggleSegment
          label={t("cutout.quality")}
          disabled={removeBusy}
          options={QUALITIES.map(([value, label]) => ({
            key: value,
            node: t(label),
            label: t(label),
            active: quality === value,
          }))}
          onChange={(next) => {
            const match = QUALITIES.find(([value]) => value === next);
            if (match) setQuality(match[0]);
          }}
        />
      </FlatField>
      {isVideo && (
        <InspectorSwitchRow
          label={t("cutout.plate")}
          checked={createPlate}
          disabled={removeBusy}
          onChange={setCreatePlate}
        />
      )}
      {removeProgress && (
        <div role="status" className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-[13px] font-medium">
            <span
              className={`min-w-0 flex-1 truncate ${status === "failed" ? "text-studio-danger" : "text-studio-text"}`}
              title={removeProgress.error ?? statusLabel}
            >
              {statusLabel}
            </span>
            {status !== "failed" && (
              <span className="tabular-nums text-studio-muted">
                {Math.round(removeProgress.progress)}%
              </span>
            )}
          </div>
          {status !== "failed" && (
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--st-hd)]">
              <div
                className="h-full rounded-full bg-[var(--st-tx)]"
                style={{ width: `${Math.max(0, Math.min(100, removeProgress.progress))}%` }}
              />
            </div>
          )}
        </div>
      )}
      <InspectorAction
        variant="secondary"
        data-flat-media-remove-bg="true"
        disabled={!canRemoveBackground || removeBusy}
        title={canRemoveBackground ? t("cutout.runTitle") : t("cutout.unavailable")}
        onClick={() => void runBackgroundRemoval()}
      >
        {removeBusy ? t("cutout.working") : t("cutout.run")}
      </InspectorAction>
    </section>
  );
}

const QUALITIES = [
  ["fast", "cutout.q.fast"],
  ["balanced", "cutout.q.balanced"],
  ["best", "cutout.q.best"],
] as const satisfies readonly (readonly [string, MessageKey])[];
