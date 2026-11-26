// "Presetări" (St-Grade): look thumbnails in a four-column grid, 14px radius, the selected
// look outlined in the text colour, its name under the frame. The board shows one row of four
// looks; "Toate" opens every look, and a chosen look outside the row joins it.
import { useState } from "react";
import {
  HF_COLOR_GRADING_GRADE_PRESETS,
  normalizeHfColorGrading,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t, useLocale } from "../../i18n/translate";
import { lookText } from "./propertyPanelColorLabels";
import { LookBlock } from "./propertyPanelColorLookUi";
import { presetPreviewHandlers } from "./propertyPanelPresetPreview";
import type {
  ColorGradingPresetPreviews,
  ColorGradingPreviewOptions,
} from "./useColorGradingController";

const FEATURED_PRESETS: readonly string[] = [
  "neutral",
  "warm-daylight",
  "clean-studio",
  "deep-contrast",
];

export function GradePresets({
  grading,
  presetPreviews,
  onRequestPresetPreviews,
  onPreviewColorGrading,
  onCommitColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  presetPreviews: ColorGradingPresetPreviews;
  onRequestPresetPreviews: () => void;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
}) {
  useLocale();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll
    ? HF_COLOR_GRADING_GRADE_PRESETS
    : HF_COLOR_GRADING_GRADE_PRESETS.filter(
        (preset) => FEATURED_PRESETS.includes(preset.id) || preset.id === grading.preset,
      );
  const track = useTrackDesignInput();
  const resolvePreset = (presetId: string) => {
    const resolved = normalizeHfColorGrading({ preset: presetId, lut: grading.lut });
    return resolved ? { ...resolved, effects: grading.effects, palette: grading.palette } : grading;
  };
  return (
    <LookBlock
      title={t("look.presets")}
      data-flat-grade-presets="true"
      action={
        <button
          type="button"
          data-flat-grade-presets-toggle="true"
          aria-expanded={showAll}
          onClick={() => setShowAll((was) => !was)}
          className="h-7 rounded-full px-2 text-[12px] font-medium text-studio-text hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
        >
          {t(showAll ? "look.presets.fewer" : "look.presets.all")}
        </button>
      }
    >
      {presetPreviews.status === "unavailable" && (
        <button
          type="button"
          onClick={onRequestPresetPreviews}
          className="self-start text-[13px] font-medium text-studio-text underline-offset-2 hover:underline"
        >
          {t("look.retryPreviews")}
        </button>
      )}
      <div data-flat-grade-preset-group="presets" className="grid grid-cols-4 gap-2">
        {shown.map((preset) => {
          const selected = grading.preset === preset.id;
          const preview = presetPreviews.images[preset.id];
          return (
            <button
              key={preset.id}
              type="button"
              data-flat-grade-preset={preset.id}
              aria-pressed={selected}
              {...presetPreviewHandlers({
                id: preset.id,
                label: preset.label,
                resolve: () => resolvePreset(preset.id),
                onPreview: onPreviewColorGrading,
                onCommit: onCommitColorGrading,
                onTrack: (name) => track("button", `Apply ${name}`),
              })}
              title={lookText(preset.label)}
              className="group flex min-w-0 flex-col items-center gap-1.5 text-center focus-visible:outline-none"
            >
              <span
                data-flat-grade-preview-frame={preset.id}
                className={`block w-full overflow-hidden rounded-md bg-studio-surface transition-shadow group-focus-visible:shadow-[0_0_0_2px_var(--st-btn)] ${
                  selected
                    ? "shadow-[0_0_0_2px_var(--st-tx)]"
                    : "shadow-[inset_0_0_0_1px_var(--st-bd)] group-hover:shadow-[0_0_0_1.5px_var(--st-sbd)]"
                }`}
                style={{ aspectRatio: "4 / 3" }}
              >
                {preview ? (
                  <img
                    data-flat-grade-preview={preset.id}
                    src={preview}
                    alt=""
                    draggable={false}
                    className="block h-full w-full object-cover"
                  />
                ) : (
                  <span
                    data-flat-grade-preview-placeholder={presetPreviews.status}
                    className="block h-full w-full"
                  />
                )}
              </span>
              <span
                className={`block w-full truncate text-[12px] ${
                  selected ? "font-semibold text-studio-text" : "text-studio-muted"
                }`}
              >
                {lookText(preset.label)}
              </span>
            </button>
          );
        })}
      </div>
    </LookBlock>
  );
}
