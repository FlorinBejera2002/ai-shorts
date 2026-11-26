// "Efecte" finish block (St-Grade, St-Inspector-VigGrain): Vinietă and Granulație amounts side
// by side, each with a settings button that opens a card with the tuning sliders.
import { useEffect, useRef, useState } from "react";
import type {
  HfColorGradingDetailKey,
  NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { t } from "../../i18n/translate";
import {
  COLOR_GRADING_DETAIL_SLIDERS,
  colorGradingWithDetail,
  GRAIN_TUNE_SLIDERS,
  normalizedColorGradingDefault,
  VIGNETTE_TUNE_SLIDERS,
} from "./propertyPanelColorGradingControls";
import { detailLabel } from "./propertyPanelColorLabels";
import { LOOK_ICONS, LookBlock, LookIconButton, LookSlider } from "./propertyPanelColorLookUi";

type FinishKind = "vignette" | "grain";

// The board writes the two amounts as bare numbers ("Vinietă 20", "Granulație 0").
const BARE_AMOUNT_KEYS: ReadonlySet<HfColorGradingDetailKey> = new Set(["vignette", "grain"]);

const detailByKey = (key: HfColorGradingDetailKey) => {
  const spec = COLOR_GRADING_DETAIL_SLIDERS.find((candidate) => candidate.key === key);
  if (!spec) throw new Error(`Unknown color grading detail key: ${key}`);
  return spec;
};

function DetailSlider({
  detailKey,
  grading,
  onCommit,
}: {
  detailKey: HfColorGradingDetailKey;
  grading: NormalizedHfColorGrading;
  onCommit: (next: NormalizedHfColorGrading) => void;
}) {
  const spec = detailByKey(detailKey);
  const value = grading.details[detailKey];
  const defaultValue = normalizedColorGradingDefault(spec);
  const isSet = Math.abs(value - defaultValue) > 1e-4;
  return (
    <LookSlider
      label={detailLabel(detailKey)}
      value={Math.round(value * spec.scale)}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      tier={isSet ? "explicitCustom" : "default"}
      displayValue={`${Math.round(value * spec.scale)}${BARE_AMOUNT_KEYS.has(detailKey) ? "" : spec.suffix}`}
      centerTick={detailKey === "vignetteRoundness"}
      onCommit={(next) => onCommit(colorGradingWithDetail(grading, detailKey, next / spec.scale))}
      onReset={() => onCommit(colorGradingWithDetail(grading, detailKey, defaultValue))}
    />
  );
}

export function GradeFinishBlock({
  grading,
  onCommitColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
}) {
  const [open, setOpen] = useState<FinishKind | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const amount = (kind: FinishKind) => (
    <div className="flex min-w-0 items-end gap-0.5">
      <div className="min-w-0 flex-1">
        <DetailSlider detailKey={kind} grading={grading} onCommit={onCommitColorGrading} />
      </div>
      <LookIconButton
        label={t(kind === "vignette" ? "look.vignetteSettings" : "look.grainSettings")}
        icon={LOOK_ICONS.more}
        size="sm"
        pressed={open === kind}
        data-flat-grade-settings={kind}
        onClick={() => setOpen((current) => (current === kind ? null : kind))}
      />
    </div>
  );

  return (
    <LookBlock title={t("look.finish")} data-flat-grade-finish="true">
      <div className="relative grid grid-cols-2 gap-2.5">
        {amount("vignette")}
        {amount("grain")}
        {open && (
          <div
            ref={cardRef}
            role="group"
            aria-label={t(open === "vignette" ? "look.vignetteSettings" : "look.grainSettings")}
            data-flat-grade-finish-card={open}
            className="absolute inset-x-[-6px] top-[calc(100%+6px)] z-30 flex flex-col gap-1 rounded-[18px] border border-[var(--st-bd)] bg-studio-surface p-4 shadow-studio"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-studio-text">
                {t(open === "vignette" ? "look.vignetteSettings" : "look.grainSettings")}
              </span>
              <LookIconButton
                label={t("look.closeSettings")}
                icon={LOOK_ICONS.close}
                onClick={() => setOpen(null)}
              />
            </div>
            {(open === "vignette" ? VIGNETTE_TUNE_SLIDERS : GRAIN_TUNE_SLIDERS).map((slider) => (
              <DetailSlider
                key={slider.key}
                detailKey={slider.key}
                grading={grading}
                onCommit={onCommitColorGrading}
              />
            ))}
          </div>
        )}
      </div>
    </LookBlock>
  );
}
