// One active effect (St-Inspector-EffectDetail, St-Inspector-Palette): its name, the hold-to-
// compare, reset and remove actions, its sliders and switches, and its palette when it has one.
import { useEffect, useRef, useState } from "react";
import {
  HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS,
  type HfColorGradingEffectKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t, useLocale } from "../../i18n/translate";
import type { ColorGradingPreviewOptions } from "./useColorGradingController";
import type { EffectControl, EffectSpec } from "./propertyPanelFlatEffectSpecs";
import { FlatEffectControl } from "./propertyPanelFlatEffectControl";
import { FlatEffectPalette } from "./propertyPanelFlatEffectPalette";
import { lookText } from "./propertyPanelColorLabels";
import {
  LOOK_ICONS,
  LookIcon,
  LookIconButton,
  LookSlider,
  LookTitle,
} from "./propertyPanelColorLookUi";

export function FlatEffectEditor({
  effect,
  grading,
  onCommitEffect,
  onCommitColorGrading,
  onPreviewColorGrading,
  onReset,
  onRemove,
}: {
  effect: EffectSpec;
  grading: NormalizedHfColorGrading;
  onCommitEffect: (key: HfColorGradingEffectKey, value: number) => void;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const name = lookText(effect.label);
  const preview = (held: boolean) =>
    onPreviewColorGrading(
      held ? { ...grading, effects: { ...grading.effects, [effect.key]: 0 } } : null,
    );

  return (
    <section data-flat-effect-editor={effect.key} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2.5">
        <LookTitle>{name}</LookTitle>
        <div className="-ml-2 flex items-center gap-1">
          <HoldCompareButton
            label={t("look.effects.hold", { name })}
            effectKey={effect.key}
            onHold={() => {
              track("button", `Compare without ${effect.label}`);
              preview(true);
            }}
            onRelease={() => preview(false)}
          />
          <LookIconButton
            label={t("look.effects.resetOne", { name })}
            icon={LOOK_ICONS.reset}
            size="lg"
            onClick={onReset}
            data-effect-reset={effect.key}
          />
          <LookIconButton
            label={t("look.effects.removeOne", { name })}
            icon={LOOK_ICONS.trash}
            size="lg"
            onClick={onRemove}
            data-effect-remove={effect.key}
          />
        </div>
      </div>
      {effect.showMaster !== false && (
        <LookSlider
          label={lookText(effect.masterLabel ?? "Mix")}
          value={grading.effects[effect.key] * 100}
          min={0}
          max={effect.max ?? 100}
          tier="explicitCustom"
          displayValue={
            effect.masterFormat?.(grading.effects[effect.key]) ??
            `${Math.round(grading.effects[effect.key] * 100)}%`
          }
          onCommit={(next) => onCommitEffect(effect.key, next / 100)}
          onReset={() =>
            onCommitEffect(
              effect.key,
              HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS[effect.key][effect.key] ?? 1,
            )
          }
        />
      )}
      {effect.settings?.map((control: EffectControl) => (
        <FlatEffectControl
          key={control.key}
          control={control}
          effect={effect}
          effects={grading.effects}
          onCommit={onCommitEffect}
        />
      ))}
      {effect.palette && (
        <FlatEffectPalette
          kind={effect.palette}
          grading={grading}
          onCommitColorGrading={onCommitColorGrading}
        />
      )}
    </section>
  );
}

/**
 * Eye button that shows the frame without the effect while it is held: by pointer, or by Space
 * or Enter. It reports the hold as aria-pressed; a plain click (assistive tech) toggles it.
 */
function HoldCompareButton({
  label,
  effectKey,
  onHold,
  onRelease,
}: {
  label: string;
  effectKey: HfColorGradingEffectKey;
  onHold: () => void;
  onRelease: () => void;
}) {
  const [held, setHeld] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const pointerHoldRef = useRef(false);
  useEffect(() => () => releaseRef.current?.(), []);

  const start = () => {
    if (releaseRef.current) return;
    setHeld(true);
    onHold();
    const release = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      releaseRef.current = null;
      setHeld(false);
      onRelease();
    };
    releaseRef.current = release;
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
  };
  const isHoldKey = (key: string) => key === " " || key === "Enter";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={held}
      data-effect-compare={effectKey}
      onPointerDown={() => {
        pointerHoldRef.current = true;
        start();
      }}
      onKeyDown={(event) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        releaseRef.current?.();
      }}
      onClick={(event) => {
        // A pointer hold already ran; a click with no pointer (screen reader) toggles.
        if (pointerHoldRef.current || event.detail > 0) {
          pointerHoldRef.current = false;
          return;
        }
        if (releaseRef.current) releaseRef.current();
        else start();
      }}
      className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-studio-text transition-colors hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
        held ? "bg-[var(--st-sub)]" : ""
      }`}
    >
      <LookIcon d={LOOK_ICONS.eye} />
    </button>
  );
}
