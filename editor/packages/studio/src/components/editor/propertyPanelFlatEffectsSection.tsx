// "Efecte" (St-Inspector-EffectsList, St-Inspector-EffectDetail, St-Inspector-Palette): three
// views in one group. The list shows the active effects and the "Familii" cards; a family shows
// its preview tiles; an effect shows its controls. "Resetează efectele" clears every effect.
import { useEffect, useState } from "react";
import {
  HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS,
  normalizeHfColorGrading,
  type HfColorGradingActiveEffectKey,
  type HfColorGradingEffectKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t, useLocale } from "../../i18n/translate";
import { PillButton } from "../ui/PillButton";
import type {
  ColorGradingPresetPreviews,
  ColorGradingPreviewOptions,
} from "./useColorGradingController";
import {
  DEFAULT_EFFECTS,
  EFFECT_GROUPS,
  EFFECT_SPECS,
  type EffectSpec,
} from "./propertyPanelFlatEffectSpecs";
import { FlatEffectEditor } from "./propertyPanelFlatEffectEditor";
import { EffectFamilies, EffectFamilyTiles } from "./propertyPanelFlatEffectFamily";
import { lookText } from "./propertyPanelColorLabels";
import {
  LOOK_ICONS,
  LOOK_ROW,
  LookBack,
  LookBlock,
  LookIconButton,
} from "./propertyPanelColorLookUi";

export function activeColorGradingEffectCount(grading: NormalizedHfColorGrading): number {
  return EFFECT_SPECS.filter((effect) => grading.effects[effect.key] > 0.0001).length;
}

export function FlatEffectsAccessory({
  grading,
  onCommitColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
}) {
  useLocale();
  const track = useTrackDesignInput();
  if (!activeColorGradingEffectCount(grading)) return null;
  return (
    <LookIconButton
      label={t("look.effects.reset")}
      icon={LOOK_ICONS.reset}
      data-flat-effects-reset="true"
      onClick={() => {
        track("button", "Reset effects");
        onCommitColorGrading({ ...grading, effects: { ...DEFAULT_EFFECTS }, palette: null });
      }}
    />
  );
}

type EffectsView =
  | { kind: "list" }
  | { kind: "family"; label: string }
  | { kind: "effect"; key: HfColorGradingActiveEffectKey };

export function FlatEffectsSection({
  grading,
  previews,
  presetPreviews,
  onCommitColorGrading,
  onPreviewColorGrading,
  onRequestEffectPreviews,
  onRequestPresetPreviews,
}: {
  grading: NormalizedHfColorGrading;
  previews: ColorGradingPresetPreviews;
  presetPreviews: ColorGradingPresetPreviews;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  onRequestEffectPreviews: (effects: readonly HfColorGradingActiveEffectKey[]) => void;
  onRequestPresetPreviews: () => void;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const activeEffects = EFFECT_SPECS.filter((effect) => grading.effects[effect.key] > 0.0001);
  const [view, setView] = useState<EffectsView>(() =>
    activeEffects[0] ? { kind: "effect", key: activeEffects[0].key } : { kind: "list" },
  );
  const editing =
    view.kind === "effect" ? activeEffects.find((effect) => effect.key === view.key) : undefined;
  const familyLabel = view.kind === "family" ? view.label : null;

  useEffect(() => {
    if (!familyLabel) return;
    const group = EFFECT_GROUPS.find((candidate) => candidate.label === familyLabel);
    if (!group) return;
    const effectKeys = group.effects.map((effect) => effect.key);
    if (previews.status !== "loading" && effectKeys.some((effect) => !previews.images[effect])) {
      onRequestEffectPreviews(effectKeys);
    }
    if (
      group.presets?.some((preset) => !presetPreviews.images[preset]) &&
      presetPreviews.status !== "loading"
    ) {
      onRequestPresetPreviews();
    }
  }, [
    familyLabel,
    onRequestEffectPreviews,
    onRequestPresetPreviews,
    presetPreviews.images,
    presetPreviews.status,
    previews.images,
    previews.status,
  ]);
  useEffect(() => () => onPreviewColorGrading(null), [onPreviewColorGrading]);

  const commitEffect = (key: HfColorGradingEffectKey, value: number) => {
    onCommitColorGrading({ ...grading, effects: { ...grading.effects, [key]: value } });
  };
  const resolveEffect = (effect: EffectSpec): NormalizedHfColorGrading => ({
    ...grading,
    effects: { ...grading.effects, ...HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS[effect.key] },
  });
  const applyEffect = (effect: EffectSpec) => {
    track("button", `Add ${effect.label}`);
    onCommitColorGrading(resolveEffect(effect));
    setView({ kind: "effect", key: effect.key });
  };
  const chooseEffect = (effect: EffectSpec) => {
    if (grading.effects[effect.key] > 0.0001) setView({ kind: "effect", key: effect.key });
    else applyEffect(effect);
  };
  const resolvePreset = (presetId: string) =>
    normalizeHfColorGrading({ preset: presetId, lut: grading.lut }) ?? grading;
  const removeEffect = (effect: EffectSpec) => {
    track("button", `Remove ${effect.label}`);
    commitEffect(effect.key, 0);
    setView({ kind: "list" });
  };
  const resetAll = () => {
    track("button", "Reset effects");
    onCommitColorGrading({ ...grading, effects: { ...DEFAULT_EFFECTS }, palette: null });
    setView({ kind: "list" });
  };
  const toList = () => {
    onPreviewColorGrading(null);
    setView({ kind: "list" });
  };

  return (
    <div className="flex flex-col gap-3.5" data-flat-effects-section="true">
      {(editing || familyLabel) && <LookBack label={t("look.effects.all")} onClick={toList} />}
      {editing ? (
        <FlatEffectEditor
          effect={editing}
          grading={grading}
          onCommitEffect={commitEffect}
          onCommitColorGrading={onCommitColorGrading}
          onPreviewColorGrading={onPreviewColorGrading}
          onReset={() => applyEffect(editing)}
          onRemove={() => removeEffect(editing)}
        />
      ) : familyLabel ? (
        <LookBlock title={lookText(familyLabel)}>
          <EffectFamilyTiles
            label={familyLabel}
            grading={grading}
            previews={previews}
            presetPreviews={presetPreviews}
            resolveEffect={resolveEffect}
            resolvePreset={resolvePreset}
            onPreviewColorGrading={onPreviewColorGrading}
            onCommitColorGrading={onCommitColorGrading}
            onChooseEffect={chooseEffect}
            onTrack={(name) => track("button", `Apply ${name}`)}
          />
        </LookBlock>
      ) : (
        <>
          {activeEffects.length > 0 && (
            <LookBlock title={t("look.effects.activeList")} data-flat-effects-active-list="true">
              {activeEffects.map((effect) => (
                <button
                  key={effect.key}
                  type="button"
                  data-flat-effect-active={effect.key}
                  onClick={() => setView({ kind: "effect", key: effect.key })}
                  className={`flex h-12 w-full items-center justify-between gap-2 px-3.5 text-left text-[13px] font-semibold text-studio-text hover:bg-[var(--st-sub)] ${LOOK_ROW}`}
                >
                  <span className="truncate">{lookText(effect.label)}</span>
                  <span className="text-[12px] font-medium text-studio-muted">
                    {t("look.effects.active")}
                  </span>
                </button>
              ))}
            </LookBlock>
          )}
          <EffectFamilies onOpen={(label) => setView({ kind: "family", label })} />
        </>
      )}
      {activeEffects.length > 0 && (
        <PillButton
          variant="secondary"
          className="mt-2 w-full"
          data-flat-effects-reset-all="true"
          onClick={resetAll}
        >
          {t("look.effects.reset")}
        </PillButton>
      )}
    </div>
  );
}
