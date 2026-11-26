// "Culoare și efecte" (St-Grade and the St-Inspector grade boards). The grade opens on St-Grade:
// colour, presets, LUT and finish, then one row per other board (light and colour, wheels,
// curves, secondary colour, LUT files, scopes, original and copy). On a phone the grade keeps the
// Culoare / Curbe / Scopuri tabs of St-M-Inspector-Wheels. Titles only, no helper text.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  normalizeHfColorGrading,
  serializeHfColorGrading,
  type HfColorGradingAdjustKey,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { t, useLocale } from "../../i18n/translate";
import { ApplyCutSettingToAll } from "./CutSettingsScope";
import { useCutSettingsScope } from "./cutSettingsScopeContext";
import type {
  ColorGradingControllerState,
  ColorGradingPresetPreviews,
  ColorGradingPreviewOptions,
  MediaMetadata,
} from "./useColorGradingController";
import { ColorCurves } from "./propertyPanelColorCurves";
import {
  COLOR_GRADING_ADJUST_SLIDERS,
  colorGradingWithAdjust,
  createColorGradingActions,
  visibleColorGradingIntensity,
} from "./propertyPanelColorGradingControls";
import { GradeCopyBlock } from "./propertyPanelColorGradeCopy";
import { GradeFinishBlock } from "./propertyPanelColorGradeFinish";
import { GradeLutBlock } from "./propertyPanelColorGradeLut";
import { GradePresets } from "./propertyPanelColorGradePresets";
import { adjustLabel, COLOR_ADJUST_KEYS, LIGHT_ADJUST_KEYS } from "./propertyPanelColorLabels";
import { GradeViewBack, GradeViewLinks, type GradeView } from "./propertyPanelColorGradeViews";
import { LOOK_SLIDER_GRID, LookBlock, LookSlider } from "./propertyPanelColorLookUi";
import { PropertyPanelColorScopes } from "./propertyPanelColorScopes";
import { PropertyPanelColorSecondary } from "./propertyPanelColorSecondary";
import { ColorWheels } from "./propertyPanelColorWheels";
import { Segment } from "../ui/Segment";
import { useIsPhone } from "../shell/useIsPhone";

/** Phone tabs over the grade (St-M-Inspector-Wheels, -CurvesPhone): colour, curves, scopes. */
type GradePhoneTab = "color" | "curves" | "scopes";

/** St-Grade's "Culoare" block: the four everyday adjustments. */
const MAIN_ADJUST_KEYS: readonly HfColorGradingAdjustKey[] = [
  "exposure",
  "contrast",
  "saturation",
  "temperature",
];

export { FlatColorGradingAccessory } from "./propertyPanelFlatColorGradingAccessory";

// Board value format (St-Inspector-GradeSliders): signed whole numbers ("0", "+8", "-10"),
// saturation as a percentage of the source ("108%"), exposure in stops.
export function formatAdjustValue(key: HfColorGradingAdjustKey, rawPercent: number): string {
  if (key === "saturation") return `${Math.round(100 + rawPercent)}%`;
  const value = key === "exposure" ? rawPercent / 100 : Math.round(rawPercent);
  if (Math.abs(value) < 1e-6) return "0";
  const text = key === "exposure" ? value.toFixed(2) : String(value);
  return value > 0 ? `+${text}` : text;
}

function resolveColorGrading(grading: Parameters<typeof normalizeHfColorGrading>[0]) {
  const resolved = normalizeHfColorGrading(grading);
  if (!resolved) throw new Error("Missing resolved color grading");
  return resolved;
}

function HdrBanner({ metadata }: { metadata: MediaMetadata | null }) {
  if (metadata?.color.dynamicRange !== "hdr") return null;
  const details = [
    metadata.color.codecName,
    metadata.color.profile,
    metadata.color.pixelFormat,
    metadata.color.colorPrimaries,
    metadata.color.colorTransfer,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      data-flat-grade-hdr-banner="true"
      className="flex flex-col gap-1 rounded-md bg-[var(--st-warn-bg)] px-3.5 py-3 text-[12px] text-[var(--st-warn-text)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {t("look.hdr.source", { label: metadata.color.label })}
        </span>
        <span className="text-[11px] font-semibold">{t("look.hdr.preview")}</span>
      </div>
      <p>{t("look.hdr.body")}</p>
      {details && (
        <p data-flat-grade-hdr-detail="true" className="truncate text-[11px]">
          {details}
        </p>
      )}
    </div>
  );
}

function AdjustSliders({
  keys,
  grading,
  onCommit,
}: {
  keys: readonly HfColorGradingAdjustKey[];
  grading: NormalizedHfColorGrading;
  onCommit: (next: NormalizedHfColorGrading) => void;
}) {
  return (
    <div className={LOOK_SLIDER_GRID}>
      {keys.map((key) => {
        const slider = COLOR_GRADING_ADJUST_SLIDERS.find((candidate) => candidate.key === key);
        if (!slider) return null;
        const rawPercent = grading.adjust[key] * slider.scale;
        return (
          <div key={key} data-flat-grade-adjust="true" className="min-w-0">
            <LookSlider
              label={adjustLabel(key)}
              value={rawPercent}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              tier={Math.abs(grading.adjust[key]) > 1e-6 ? "explicitCustom" : "default"}
              displayValue={formatAdjustValue(key, rawPercent)}
              centerTick
              onCommit={(next) =>
                onCommit(colorGradingWithAdjust(grading, key, next / slider.scale))
              }
              onReset={() => onCommit(colorGradingWithAdjust(grading, key, 0))}
            />
          </div>
        );
      })}
    </div>
  );
}

// fallow-ignore-next-line complexity
export function FlatColorGradingSection({
  grading,
  assets,
  onImportAssets,
  onCommitColorGrading,
  onPreviewColorGrading,
  applyScope,
  applyBusy,
  onSetApplyScope,
  onApplyToScope,
  onApplyScopeAvailable,
  mediaMetadata,
  presetPreviews,
  onRequestPresetPreviews,
  captureGradedFrame,
  actionsSlot,
}: {
  /** "Ține pentru original" and "Resetează culoarea", shown on the original-and-copy view. */
  actionsSlot?: ReactNode;
  grading: NormalizedHfColorGrading;
  assets: string[];
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
  onPreviewColorGrading: (
    next: NormalizedHfColorGrading | null,
    options?: ColorGradingPreviewOptions,
  ) => void;
  applyScope: "source-file" | "project";
  applyBusy: boolean;
  onSetApplyScope: (scope: "source-file" | "project") => void;
  onApplyToScope: () => void;
  onApplyScopeAvailable: boolean;
  mediaMetadata: MediaMetadata | null;
  presetPreviews: ColorGradingPresetPreviews;
  onRequestPresetPreviews: () => void;
  captureGradedFrame: ColorGradingControllerState["captureGradedFrame"];
}) {
  useLocale();
  const cutScope = useCutSettingsScope();
  const isPhone = useIsPhone();
  const [phoneTab, setPhoneTab] = useState<GradePhoneTab>("color");
  const [view, setView] = useState<GradeView>("main");
  const resolvedGrading = useMemo(() => resolveColorGrading(grading), [grading]);
  const secondaryInputGrading = useMemo(
    () =>
      resolveColorGrading({
        intensity: 1,
        adjust: resolvedGrading.adjust,
        wheels: resolvedGrading.wheels,
        curves: resolvedGrading.curves,
        hueCurves: resolvedGrading.hueCurves,
        colorSpace: resolvedGrading.colorSpace,
      }),
    [
      resolvedGrading.adjust,
      resolvedGrading.colorSpace,
      resolvedGrading.curves,
      resolvedGrading.hueCurves,
      resolvedGrading.wheels,
    ],
  );
  const actions = createColorGradingActions(grading, onCommitColorGrading);
  const scopesRefreshKey = useMemo(() => serializeHfColorGrading(grading), [grading]);
  const visible = (patch: Partial<NormalizedHfColorGrading>): NormalizedHfColorGrading => ({
    ...grading,
    intensity: visibleColorGradingIntensity(grading),
    ...patch,
  });

  useEffect(() => {
    if (presetPreviews.status === "idle") onRequestPresetPreviews();
  }, [onRequestPresetPreviews, presetPreviews.status]);
  useEffect(() => () => onPreviewColorGrading(null), [onPreviewColorGrading]);

  const previewWheels = (wheels: NormalizedHfColorGrading["wheels"]) =>
    onPreviewColorGrading(visible({ wheels }));
  const commitWheels = (wheels: NormalizedHfColorGrading["wheels"]) =>
    onCommitColorGrading(visible({ wheels }));
  const sliders = (keys: readonly HfColorGradingAdjustKey[]) => (
    <AdjustSliders keys={keys} grading={grading} onCommit={onCommitColorGrading} />
  );

  const blocks: Record<Exclude<GradeView, "main">, () => ReactNode> = {
    light: () => (
      <>
        <LookBlock title={t("look.light")}>{sliders(LIGHT_ADJUST_KEYS)}</LookBlock>
        <LookBlock title={t("look.color")}>{sliders(COLOR_ADJUST_KEYS)}</LookBlock>
        <LookSlider
          label={t("look.amount")}
          value={Math.round(grading.intensity * 100)}
          min={0}
          max={100}
          tier={grading.intensity === 1 ? "default" : "explicitCustom"}
          displayValue={`${Math.round(grading.intensity * 100)}%`}
          onCommit={actions.setIntensityPercent}
          onReset={() => actions.setIntensityPercent(100)}
        />
      </>
    ),
    wheels: () => (
      <LookBlock title={t("look.wheels")} data-flat-grade-wheels="true">
        <ColorWheels
          value={resolvedGrading.wheels}
          onPreview={previewWheels}
          onCommit={commitWheels}
        />
      </LookBlock>
    ),
    curves: () => (
      <LookBlock title={isPhone ? undefined : t("look.curves")}>
        <ColorCurves
          value={{ curves: resolvedGrading.curves, hueCurves: resolvedGrading.hueCurves }}
          onPreview={({ curves, hueCurves }) =>
            onPreviewColorGrading(visible({ curves, hueCurves }))
          }
          onCommit={({ curves, hueCurves }) => onCommitColorGrading(visible({ curves, hueCurves }))}
        />
      </LookBlock>
    ),
    secondary: () => (
      <PropertyPanelColorSecondary
        secondaries={resolvedGrading.secondaries}
        captureFrame={() => captureGradedFrame({ grading: secondaryInputGrading })}
        onCommit={(secondaries) => onCommitColorGrading(visible({ secondaries }))}
      />
    ),
    lut: () => (
      <GradeLutBlock
        grading={grading}
        assets={assets}
        actions={actions}
        onImportAssets={onImportAssets}
      />
    ),
    scopes: () => (
      <PropertyPanelColorScopes
        captureFrame={() => captureGradedFrame()}
        refreshKey={scopesRefreshKey}
      />
    ),
    actions: () => (
      <GradeActionsView
        actionsSlot={actionsSlot}
        grading={grading}
        cutScope={Boolean(cutScope)}
        showCopy={onApplyScopeAvailable && !cutScope}
        applyScope={applyScope}
        applyBusy={applyBusy}
        onSetApplyScope={onSetApplyScope}
        onApplyToScope={onApplyToScope}
      />
    ),
  };

  // St-M-Inspector-Wheels: on a phone the wheels come first, the everyday sliders under them.
  const main = (
    <>
      {isPhone && (
        <ColorWheels
          compact
          value={resolvedGrading.wheels}
          onPreview={previewWheels}
          onCommit={commitWheels}
        />
      )}
      {isPhone ? (
        sliders(MAIN_ADJUST_KEYS)
      ) : (
        <LookBlock title={t("look.color")} data-flat-grade-main-color="true">
          {sliders(MAIN_ADJUST_KEYS)}
        </LookBlock>
      )}
      <GradePresets
        grading={grading}
        presetPreviews={presetPreviews}
        onRequestPresetPreviews={onRequestPresetPreviews}
        onPreviewColorGrading={onPreviewColorGrading}
        onCommitColorGrading={onCommitColorGrading}
      />
      <GradeLutBlock
        variant="compact"
        grading={grading}
        assets={assets}
        actions={actions}
        onImportAssets={onImportAssets}
      />
      <GradeFinishBlock grading={grading} onCommitColorGrading={onCommitColorGrading} />
      <GradeViewLinks views={isPhone ? PHONE_LINKS : DESKTOP_LINKS} onOpen={setView} />
    </>
  );

  const showPhoneTabs = isPhone && view === "main";
  let body: ReactNode = main;
  if (view !== "main") body = blocks[view]();
  else if (isPhone && phoneTab !== "color") body = blocks[phoneTab]();

  return (
    <div
      className="flex min-h-full flex-col gap-5 pb-2"
      data-flat-grade-section="true"
      data-flat-grade-view={view}
    >
      <HdrBanner metadata={mediaMetadata} />
      {view !== "main" && <GradeViewBack onBack={() => setView("main")} />}
      {showPhoneTabs && (
        <Segment
          label={t("look.phoneTabs")}
          className="flex w-full !shadow-[inset_0_0_0_1px_var(--st-bd)] [&>button]:flex-1"
          value={phoneTab}
          onChange={setPhoneTab}
          options={[
            { value: "color", label: t("look.tab.color") },
            { value: "curves", label: t("look.tab.curves") },
            { value: "scopes", label: t("look.tab.scopes") },
          ]}
        />
      )}
      {body}
    </div>
  );
}

const DESKTOP_LINKS = [
  "light",
  "wheels",
  "curves",
  "secondary",
  "lut",
  "scopes",
  "actions",
] as const satisfies readonly Exclude<GradeView, "main">[];
// Curves and scopes are phone tabs already.
const PHONE_LINKS = [
  "light",
  "wheels",
  "secondary",
  "lut",
  "actions",
] as const satisfies readonly Exclude<GradeView, "main">[];

/** St-Inspector-GradeActions: hold for the original, reset, then copy the grade. */
function GradeActionsView({
  actionsSlot,
  grading,
  cutScope,
  showCopy,
  applyScope,
  applyBusy,
  onSetApplyScope,
  onApplyToScope,
}: {
  actionsSlot: ReactNode;
  grading: NormalizedHfColorGrading;
  cutScope: boolean;
  showCopy: boolean;
  applyScope: "source-file" | "project";
  applyBusy: boolean;
  onSetApplyScope: (scope: "source-file" | "project") => void;
  onApplyToScope: () => void;
}) {
  return (
    <>
      {actionsSlot}
      {cutScope && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-studio-text">
            {t("look.section.grade")}
          </span>
          <ApplyCutSettingToAll
            label="color grading"
            displayLabel={t("look.applyCut")}
            settings={[
              {
                type: "attribute",
                name: "data-color-grading",
                value: serializeHfColorGrading(grading),
              },
            ]}
          />
        </div>
      )}
      {showCopy && (
        <GradeCopyBlock
          applyScope={applyScope}
          applyBusy={applyBusy}
          onSetApplyScope={onSetApplyScope}
          onApplyToScope={onApplyToScope}
        />
      )}
    </>
  );
}
