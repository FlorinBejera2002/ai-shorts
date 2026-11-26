import { memo, useCallback } from "react";
import { useCaptionStore } from "../store";
import type { CaptionAnimation, CaptionAnimationSet, CaptionModel } from "../types";
import { Section, SelectField, SliderField, type SelectChoice } from "./shared";
import { EmptyState } from "../../components/ui";
import { messagesEn, type MessageKey } from "../../i18n/dictionary";
import { getStudioLocale, t, useLocale, usesDecimalComma } from "../../i18n/translate";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTRANCE_PRESETS = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "pop",
  "slam",
  "bounce",
  "typewriter",
  "blur-in",
  "flip",
  "drop",
];

const HIGHLIGHT_PRESETS = [
  "none",
  "color-change",
  "scale-pop",
  "glow-pulse",
  "underline-sweep",
  "background-fill",
  "bounce",
];

const EXIT_PRESETS = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-left",
  "slide-right",
  "scatter",
  "drop",
  "collapse",
  "blur-out",
  "shrink",
];

const EASE_PRESETS = [
  "power1.out",
  "power2.out",
  "power3.out",
  "power4.out",
  "power1.in",
  "power2.in",
  "power3.in",
  "power1.inOut",
  "power2.inOut",
  "back.out(1.7)",
  "elastic.out(1,0.3)",
  "bounce.out",
];

// Animation edits currently mutate only the in-memory model: they are not
// applied to the preview and not serialized by buildOverrides, so tuning them
// would be editing blind. Controls stay visible (so the capability is
// discoverable) but disabled until the apply/persist pipeline exists.
const ANIMATION_PIPELINE_WIRED = false;

// ---------------------------------------------------------------------------
// Animation phase controls
// ---------------------------------------------------------------------------

function presetLabel(preset: string, offLabel: MessageKey): string {
  if (preset === "none") return t(offLabel);
  const key = `cap.p.${preset}`;
  return isMessageKey(key) ? t(key) : preset;
}

function easeLabel(ease: string): string {
  const key = `cap.e.${ease}`;
  return isMessageKey(key) ? t(key) : ease;
}

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(messagesEn, key);
}

interface AnimationPhaseProps {
  label: string;
  presets: string[];
  /** The label of the "none" preset ("Fără", or "Oprit" for the highlight). */
  offLabel: MessageKey;
  animation: CaptionAnimation | null;
  showIntensity?: boolean;
  disabled?: boolean;
  onChange: (update: Partial<CaptionAnimation>) => void;
}

/** "0,4 s" in Romanian, "0.4 s" in English. */
const seconds = (value: number) => {
  const text = String(Number(value.toFixed(2)));
  return `${usesDecimalComma(getStudioLocale()) ? text.replace(".", ",") : text} s`;
};

/** St-Inspector-CapIn / CapOut: preset select, Durată | Decalaj, Curbă | Intensitate. */
function AnimationPhase({
  label,
  presets,
  offLabel,
  animation,
  showIntensity,
  disabled,
  onChange,
}: AnimationPhaseProps) {
  const preset = animation?.preset ?? "none";
  const duration = animation?.duration ?? 0.2;
  const ease = animation?.ease ?? "power2.out";
  const stagger = animation?.stagger ?? 0;
  const intensity = animation?.intensity ?? 1;
  const mixed = t("cap.mixed");
  const presetChoices: SelectChoice[] = presets.map((value) => ({
    value,
    label: presetLabel(value, offLabel),
  }));
  const easeChoices: SelectChoice[] = EASE_PRESETS.map((value) => ({
    value,
    label: easeLabel(value),
  }));

  return (
    <Section label={label} columns={1}>
      <SelectField
        label={`${label} ${t("cap.preset")}`}
        value={preset}
        options={presetChoices}
        disabled={disabled}
        onChange={(next) => onChange({ preset: next })}
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <SliderField
          label={t("cap.duration")}
          value={duration}
          min={0}
          max={2}
          step={0.05}
          mixedLabel={mixed}
          disabled={disabled}
          format={seconds}
          onChange={(v) => onChange({ duration: v })}
        />
        <SliderField
          label={t("cap.stagger")}
          value={stagger}
          min={0}
          max={0.5}
          step={0.01}
          mixedLabel={mixed}
          disabled={disabled}
          format={seconds}
          onChange={(v) => onChange({ stagger: v })}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-medium text-studio-text">{t("cap.ease")}</span>
          <SelectField
            label={`${label} ${t("cap.ease")}`}
            value={ease}
            options={easeChoices}
            disabled={disabled}
            onChange={(next) => onChange({ ease: next })}
          />
        </div>
        {showIntensity && (
          <SliderField
            label={t("cap.intensity")}
            value={intensity}
            min={0}
            max={1}
            step={0.01}
            mixedLabel={mixed}
            disabled={disabled}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onChange({ intensity: v })}
          />
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Selection resolution
// ---------------------------------------------------------------------------

/** The group to edit: the explicitly selected group, else the group owning the first selected segment. */
function resolveAnimationGroupId(
  model: CaptionModel | null,
  selectedGroupId: string | null,
  selectedSegmentIds: Set<string>,
): string | null {
  if (selectedGroupId || !model || selectedSegmentIds.size === 0) return selectedGroupId;
  const firstSegmentId = [...selectedSegmentIds][0];
  if (!firstSegmentId) return null;
  for (const [groupId, group] of model.groups) {
    if (group.segmentIds.includes(firstSegmentId)) return groupId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CaptionAnimationPanel = memo(function CaptionAnimationPanel() {
  useLocale();
  const model = useCaptionStore((s) => s.model);
  const selectedGroupId = useCaptionStore((s) => s.selectedGroupId);
  const selectedSegmentIds = useCaptionStore((s) => s.selectedSegmentIds);
  const updateGroupAnimation = useCaptionStore((s) => s.updateGroupAnimation);
  const applyAnimationToAll = useCaptionStore((s) => s.applyAnimationToAll);

  const resolvedGroupId = resolveAnimationGroupId(model, selectedGroupId, selectedSegmentIds);
  const group = resolvedGroupId ? model?.groups.get(resolvedGroupId) : undefined;
  const animation = group?.animation;

  // All hooks must be called before any early return
  const handlePhaseChange = useCallback(
    (phase: keyof CaptionAnimationSet, update: Partial<CaptionAnimation>) => {
      if (resolvedGroupId) updateGroupAnimation(resolvedGroupId, phase, update);
    },
    [resolvedGroupId, updateGroupAnimation],
  );

  const handleApplyToAll = useCallback(() => {
    if (animation) applyAnimationToAll(animation);
  }, [animation, applyAnimationToAll]);

  // Empty state — after all hooks
  if (!group || !resolvedGroupId || !animation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState illustration="studio-nothing-selected" title={t("cap.emptyAnimation")} />
      </div>
    );
  }

  const gated = !ANIMATION_PIPELINE_WIRED;

  return (
    <div className="flex flex-col h-full min-h-0">
      {gated && (
        <p
          role="status"
          className="mx-4 mb-3 flex-shrink-0 rounded-sm bg-[var(--st-warn-bg)] px-3 py-2 text-xs font-medium text-[var(--st-warn-text)]"
        >
          {t("cap.gated")}
        </p>
      )}

      {/* Scrollable content */}
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <AnimationPhase
          label={t("cap.entrance")}
          presets={ENTRANCE_PRESETS}
          offLabel="cap.p.none"
          animation={animation.entrance}
          disabled={gated}
          onChange={(update) => handlePhaseChange("entrance", update)}
        />

        <AnimationPhase
          label={t("cap.highlight")}
          presets={HIGHLIGHT_PRESETS}
          offLabel="cap.highlightOff"
          animation={animation.highlight}
          showIntensity
          disabled={gated}
          onChange={(update) => handlePhaseChange("highlight", update)}
        />

        <AnimationPhase
          label={t("cap.exit")}
          presets={EXIT_PRESETS}
          offLabel="cap.p.none"
          animation={animation.exit}
          disabled={gated}
          onChange={(update) => handlePhaseChange("exit", update)}
        />
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 pt-2 pb-4">
        <button
          type="button"
          onClick={handleApplyToAll}
          disabled={gated}
          title={gated ? t("cap.gated") : undefined}
          className="h-11 w-full rounded-full text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] transition-colors hover:bg-[var(--st-sub)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t("cap.applyAll")}
        </button>
      </div>
    </div>
  );
});
