// Effect families (St-Inspector-EffectsList): the "Familii" cards with their counts, and one
// family's preview tiles (treatments first, then single effects).
import {
  HF_COLOR_GRADING_EFFECT_PRESETS,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { t } from "../../i18n/translate";
import type {
  ColorGradingPresetPreviews,
  ColorGradingPreviewOptions,
} from "./useColorGradingController";
import { EFFECT_GROUPS, type EffectSpec } from "./propertyPanelFlatEffectSpecs";
import { EffectTile } from "./propertyPanelFlatEffectTile";
import { lookText } from "./propertyPanelColorLabels";
import { LOOK_ROW, LookBlock } from "./propertyPanelColorLookUi";
import { presetPreviewHandlers } from "./propertyPanelPresetPreview";

type EffectGroup = (typeof EFFECT_GROUPS)[number];

export function effectGroupCount(group: EffectGroup): number {
  return group.effects.length + (group.presets?.length ?? 0);
}

export function EffectFamilies({ onOpen }: { onOpen: (label: string) => void }) {
  return (
    <LookBlock title={t("look.effects.families")} data-flat-effects-families="true">
      <div className="grid grid-cols-2 gap-2">
        {EFFECT_GROUPS.map((group) => (
          <button
            key={group.label}
            type="button"
            data-flat-effect-group={group.label}
            onClick={() => onOpen(group.label)}
            className={`flex h-12 min-w-0 items-center gap-1.5 pr-2.5 pl-3 text-left text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${LOOK_ROW}`}
          >
            <span className="min-w-0 flex-1 truncate">{lookText(group.label)}</span>
            <span className="flex h-[22px] flex-none items-center rounded-sm bg-[var(--st-sub)] px-2 text-[12px] font-semibold text-studio-muted">
              {effectGroupCount(group)}
            </span>
          </button>
        ))}
      </div>
    </LookBlock>
  );
}

export function EffectFamilyTiles({
  label,
  grading,
  previews,
  presetPreviews,
  resolveEffect,
  resolvePreset,
  onPreviewColorGrading,
  onCommitColorGrading,
  onChooseEffect,
  onTrack,
}: {
  label: string;
  grading: NormalizedHfColorGrading;
  previews: ColorGradingPresetPreviews;
  presetPreviews: ColorGradingPresetPreviews;
  resolveEffect: (effect: EffectSpec) => NormalizedHfColorGrading;
  resolvePreset: (presetId: string) => NormalizedHfColorGrading;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
  onChooseEffect: (effect: EffectSpec) => void;
  onTrack: (name: string) => void;
}) {
  const group = EFFECT_GROUPS.find((candidate) => candidate.label === label);
  if (!group) return null;
  return (
    <section
      data-flat-effects-catalog="true"
      role="group"
      aria-label={lookText(group.label)}
      className="grid grid-cols-2 gap-2"
    >
      {group.presets?.map((presetId) => {
        const preset = HF_COLOR_GRADING_EFFECT_PRESETS.find(
          (candidate) => candidate.id === presetId,
        );
        if (!preset) return null;
        return (
          <EffectTile
            key={preset.id}
            label={lookText(preset.label)}
            selected={grading.preset === preset.id}
            image={presetPreviews.images[preset.id]}
            aspect={`${presetPreviews.width} / ${presetPreviews.height}`}
            status={presetPreviews.status}
            dataAttrs={{
              "data-flat-effect-preset": preset.id,
              imageAttr: "data-flat-effect-preset-preview",
              placeholderAttr: "data-flat-effect-preset-placeholder",
              id: preset.id,
            }}
            handlers={presetPreviewHandlers({
              id: preset.id,
              label: preset.label,
              resolve: () => resolvePreset(preset.id),
              onPreview: onPreviewColorGrading,
              onCommit: onCommitColorGrading,
              onTrack,
            })}
          />
        );
      })}
      {group.effects.map((effect) => (
        <EffectTile
          key={effect.key}
          label={lookText(effect.label)}
          selected={grading.effects[effect.key] > 0.0001}
          image={previews.images[effect.key]}
          aspect={`${previews.width} / ${previews.height}`}
          status={previews.status}
          dataAttrs={{
            "data-flat-effect-option": effect.key,
            imageAttr: "data-flat-effect-preview",
            placeholderAttr: "data-flat-effect-preview-placeholder",
            frameAttr: "data-flat-effect-preview-frame",
            id: effect.key,
          }}
          handlers={{
            title: `Preview ${effect.label}`,
            onPointerEnter: () =>
              onPreviewColorGrading(resolveEffect(effect), {
                animatedPreview: { kind: "effects", id: effect.key },
              }),
            onPointerLeave: () => onPreviewColorGrading(null),
            onFocus: () => onPreviewColorGrading(resolveEffect(effect)),
            onBlur: () => onPreviewColorGrading(null),
            onClick: () => onChooseEffect(effect),
          }}
        />
      ))}
    </section>
  );
}
