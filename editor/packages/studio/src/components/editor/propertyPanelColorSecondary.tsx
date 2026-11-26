import { useEffect, useRef, useState } from "react";
import {
  getHfColorGradingCapabilities,
  normalizeHfColorGrading,
  type NormalizedHfColorGradingSecondary,
} from "@hyperframes/core/color-grading";
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import { PillButton } from "../ui/PillButton";
import {
  LOOK_ICONS,
  LOOK_SLIDER_GRID,
  LookIcon,
  LookIconButton,
  LookSlider,
  LookTitle,
} from "./propertyPanelColorLookUi";
import { FlatToggle } from "./propertyPanelFlatToggle";
import type { ColorGradingCapturedFrame } from "./useColorGradingPreviews";
import {
  buildColorGradingSecondaryMatte,
  readColorGradingFramePixels,
  sampleColorGradingSecondary,
} from "./colorGradingFrameAnalysis";

type Secondaries = readonly NormalizedHfColorGradingSecondary[];

const SECONDARY_CAPABILITIES = getHfColorGradingCapabilities().secondaries;
const PERCENT_SCALE = 100;
const RANGE_GAP = 0.01;
const HUE_CENTER_MAX = SECONDARY_CAPABILITIES.hue.center.maxExclusive - RANGE_GAP;

function wrapHueCenter(value: number): number {
  const { min, maxExclusive } = SECONDARY_CAPABILITIES.hue.center;
  const span = maxExclusive - min;
  return ((((value - min) % span) + span) % span) + min;
}

const CORRECTION_CONTROLS = [
  ["hueShift", "look.secondary.hueShift", 1, "°"],
  ["saturation", "look.secondary.saturation", PERCENT_SCALE, "%"],
  ["luma", "look.secondary.luma", PERCENT_SCALE, "%"],
  ["temperature", "look.secondary.temperature", PERCENT_SCALE, "%"],
  ["tint", "look.secondary.tint", PERCENT_SCALE, "%"],
] as const satisfies ReadonlyArray<readonly [string, MessageKey, number, string]>;

const QUALIFIER_LABEL = {
  saturation: {
    min: "look.secondary.saturationMin",
    max: "look.secondary.saturationMax",
    softness: "look.secondary.saturationSoftness",
  },
  luma: {
    min: "look.secondary.lumaMin",
    max: "look.secondary.lumaMax",
    softness: "look.secondary.lumaSoftness",
  },
} as const satisfies Record<string, Record<"min" | "max" | "softness", MessageKey>>;

/** Small swatch of the hue a selection keys on (St-Inspector-Secondary). */
function keySwatch(secondary: NormalizedHfColorGradingSecondary | undefined): string {
  if (!secondary) return "var(--st-bd)";
  return `hsl(${Math.round(secondary.key.hue.center)} 60% 55%)`;
}

function defaultSecondary(): NormalizedHfColorGradingSecondary {
  const secondary = normalizeHfColorGrading({
    secondaries: [{ key: {}, correction: {} }],
  })?.secondaries?.[0];
  if (!secondary) throw new Error("Missing default color grading secondary");
  return secondary;
}

const DEFAULT_SECONDARY = defaultSecondary();

function sampleCapturedFrame(
  pixels: Uint8ClampedArray,
  frame: ColorGradingCapturedFrame,
  target: HTMLElement,
  clientX?: number,
  clientY?: number,
) {
  const rect = target.getBoundingClientRect();
  const x = (clientX === undefined ? 0.5 : (clientX - rect.left) / rect.width) * frame.width;
  const y = (clientY === undefined ? 0.5 : (clientY - rect.top) / rect.height) * frame.height;
  return sampleColorGradingSecondary(pixels, frame.width, frame.height, x, y);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function PropertyPanelColorSecondary({
  secondaries,
  captureFrame,
  onCommit,
}: {
  secondaries: Secondaries;
  captureFrame: () => Promise<ColorGradingCapturedFrame | null>;
  onCommit: (secondaries: Secondaries) => void;
}) {
  useLocale();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sampleFrame, setSampleFrame] = useState<ColorGradingCapturedFrame | null>(null);
  const [samplePixels, setSamplePixels] = useState<Uint8ClampedArray | null>(null);
  const [showMatte, setShowMatte] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);
  const matteCanvasRef = useRef<HTMLCanvasElement>(null);
  const activeIndex = Math.min(selectedIndex, Math.max(0, secondaries.length - 1));
  const selected = secondaries[activeIndex];

  useEffect(() => {
    const canvas = matteCanvasRef.current;
    if (!showMatte || !canvas || !sampleFrame || !samplePixels || !selected) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = context.createImageData(sampleFrame.width, sampleFrame.height);
    image.data.set(
      buildColorGradingSecondaryMatte(
        samplePixels,
        sampleFrame.width,
        sampleFrame.height,
        selected.key,
      ),
    );
    context.putImageData(image, 0, 0);
  }, [sampleFrame, samplePixels, selected, showMatte]);

  const replaceSelected = (next: NormalizedHfColorGradingSecondary) => {
    if (!selected) return;
    onCommit(secondaries.map((secondary, index) => (index === activeIndex ? next : secondary)));
  };
  const addSecondary = () => {
    if (secondaries.length >= SECONDARY_CAPABILITIES.max) return;
    onCommit([...secondaries, DEFAULT_SECONDARY]);
    setSelectedIndex(secondaries.length);
  };
  const removeSelected = () => {
    if (!selected) return;
    const next = secondaries.filter((_, index) => index !== activeIndex);
    onCommit(next);
    setSelectedIndex(Math.max(0, Math.min(activeIndex, next.length - 1)));
    setSampleFrame(null);
    setSamplePixels(null);
    setCaptureError(null);
  };

  return (
    <section className="flex flex-col gap-2.5" data-flat-grade-secondary="true">
      <LookTitle
        action={
          <span className="flex items-center gap-1">
            {secondaries.map((secondary, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={activeIndex === index}
                aria-label={t("look.secondary.select", { n: index + 1 })}
                title={t("look.secondary.select", { n: index + 1 })}
                onClick={() => {
                  setSelectedIndex(index);
                  setSampleFrame(null);
                  setSamplePixels(null);
                  setCaptureError(null);
                }}
                className={`h-8 w-8 rounded-md transition-shadow ${
                  activeIndex === index
                    ? "shadow-[0_0_0_2px_var(--st-tx)]"
                    : "shadow-[inset_0_0_0_1px_var(--st-bd)] hover:shadow-[0_0_0_1.5px_var(--st-sbd)]"
                }`}
                style={{ backgroundColor: keySwatch(secondary) }}
              />
            ))}
            <LookIconButton
              label={t("look.secondary.add")}
              icon={LOOK_ICONS.plus}
              disabled={secondaries.length >= SECONDARY_CAPABILITIES.max}
              onClick={addSecondary}
            />
          </span>
        }
      >
        {t("look.secondary.title")}
      </LookTitle>

      {!selected ? (
        <PillButton
          variant="secondary"
          className="w-full"
          title="Add color selection"
          onClick={addSecondary}
        >
          <LookIcon d={LOOK_ICONS.plus} />
          {t("look.secondary.addSelection")}
        </PillButton>
      ) : (
        <>
          <FlatToggle
            label={t("look.secondary.enabled")}
            checked={selected.enabled}
            onChange={(enabled) => replaceSelected({ ...selected, enabled })}
          />
          <button
            type="button"
            disabled={sampling}
            onClick={async () => {
              setSampling(true);
              setCaptureError(null);
              try {
                const frame = await captureFrame();
                if (!frame) throw new Error("Frame capture unavailable");
                const pixels = await readColorGradingFramePixels(frame);
                if (!pixels) throw new Error("Frame pixels unavailable");
                setSampleFrame(frame);
                setSamplePixels(pixels);
                setShowMatte(false);
              } catch {
                setSampleFrame(null);
                setSamplePixels(null);
                setCaptureError(t("look.secondary.captureError"));
              } finally {
                setSampling(false);
              }
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)] disabled:opacity-50"
          >
            <LookIcon d={LOOK_ICONS.dropper} />
            {sampling ? t("look.secondary.capturing") : t("look.secondary.sample")}
          </button>
          {captureError && (
            <p role="alert" className="text-[12px] font-medium text-studio-danger">
              {captureError}
            </p>
          )}
          {sampleFrame && samplePixels && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1 self-start rounded-full p-1 shadow-[inset_0_0_0_1px_var(--st-bd)]">
                {([false, true] as const).map((matte) => (
                  <button
                    key={String(matte)}
                    type="button"
                    aria-pressed={showMatte === matte}
                    onClick={() => setShowMatte(matte)}
                    className={`h-8 rounded-full px-3 text-[12px] font-medium ${
                      showMatte === matte
                        ? "bg-studio-selected text-studio-on-selected"
                        : "text-studio-muted hover:text-studio-text"
                    }`}
                  >
                    {matte ? t("look.secondary.matte") : t("look.secondary.source")}
                  </button>
                ))}
              </div>
              {showMatte ? (
                <canvas
                  ref={matteCanvasRef}
                  width={sampleFrame.width}
                  height={sampleFrame.height}
                  role="img"
                  aria-label={t("look.secondary.matteAria")}
                  className="block h-auto w-full rounded-md bg-black"
                />
              ) : (
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-md bg-black"
                  title={t("look.secondary.sampleAria")}
                  aria-label="Sample color from captured frame"
                  onClick={(event) => {
                    const pointer: [] | [number, number] =
                      event.detail === 0 ? [] : [event.clientX, event.clientY];
                    const key = sampleCapturedFrame(
                      samplePixels,
                      sampleFrame,
                      event.currentTarget,
                      ...pointer,
                    );
                    if (!key) return;
                    replaceSelected({ ...selected, key });
                    setShowMatte(true);
                  }}
                >
                  <img
                    src={sampleFrame.dataUrl}
                    alt=""
                    draggable={false}
                    className="block h-auto w-full cursor-crosshair object-contain"
                  />
                </button>
              )}
            </div>
          )}

          <LookTitle>{t("look.secondary.qualifier")}</LookTitle>
          <div className={LOOK_SLIDER_GRID}>
            <LookSlider
              label={t("look.secondary.hue")}
              value={selected.key.hue.center}
              min={SECONDARY_CAPABILITIES.hue.center.min}
              max={HUE_CENTER_MAX}
              step={0.1}
              tier="explicitCustom"
              displayValue={`${Math.round(selected.key.hue.center)}°`}
              onCommit={(center) =>
                replaceSelected({
                  ...selected,
                  key: {
                    ...selected.key,
                    hue: { ...selected.key.hue, center: wrapHueCenter(center) },
                  },
                })
              }
            />
            <LookSlider
              label={t("look.secondary.hueRange")}
              value={selected.key.hue.range}
              min={SECONDARY_CAPABILITIES.hue.range.min}
              max={SECONDARY_CAPABILITIES.hue.range.max}
              tier="explicitCustom"
              displayValue={`${Math.round(selected.key.hue.range)}°`}
              onCommit={(range) =>
                replaceSelected({
                  ...selected,
                  key: {
                    ...selected.key,
                    hue: {
                      ...selected.key.hue,
                      range,
                      softness: Math.min(
                        selected.key.hue.softness,
                        SECONDARY_CAPABILITIES.hue.rangePlusSoftnessMax - range,
                      ),
                    },
                  },
                })
              }
            />
            <LookSlider
              label={t("look.secondary.hueSoftness")}
              value={selected.key.hue.softness}
              min={SECONDARY_CAPABILITIES.hue.softness.min}
              max={Math.min(
                SECONDARY_CAPABILITIES.hue.softness.max,
                SECONDARY_CAPABILITIES.hue.rangePlusSoftnessMax - selected.key.hue.range,
              )}
              tier="explicitCustom"
              displayValue={`${Math.round(selected.key.hue.softness)}°`}
              onCommit={(softness) =>
                replaceSelected({
                  ...selected,
                  key: { ...selected.key, hue: { ...selected.key.hue, softness } },
                })
              }
            />
            {(["saturation", "luma"] as const).flatMap((key) => {
              const labels = QUALIFIER_LABEL[key];
              const range = selected.key[key];
              const capability = SECONDARY_CAPABILITIES[key];
              return [
                <LookSlider
                  key={`${key}-min`}
                  label={t(labels.min)}
                  value={range.min * PERCENT_SCALE}
                  min={capability.min.min * PERCENT_SCALE}
                  max={capability.min.max * PERCENT_SCALE}
                  tier="explicitCustom"
                  displayValue={percent(range.min)}
                  onCommit={(value) =>
                    replaceSelected({
                      ...selected,
                      key: {
                        ...selected.key,
                        [key]: {
                          ...range,
                          min: Math.max(
                            capability.min.min,
                            Math.min(value / PERCENT_SCALE, range.max - RANGE_GAP),
                          ),
                        },
                      },
                    })
                  }
                />,
                <LookSlider
                  key={`${key}-max`}
                  label={t(labels.max)}
                  value={range.max * PERCENT_SCALE}
                  min={capability.max.min * PERCENT_SCALE}
                  max={capability.max.max * PERCENT_SCALE}
                  tier="explicitCustom"
                  displayValue={percent(range.max)}
                  onCommit={(value) =>
                    replaceSelected({
                      ...selected,
                      key: {
                        ...selected.key,
                        [key]: {
                          ...range,
                          max: Math.min(
                            capability.max.max,
                            Math.max(value / PERCENT_SCALE, range.min + RANGE_GAP),
                          ),
                        },
                      },
                    })
                  }
                />,
                <LookSlider
                  key={`${key}-softness`}
                  label={t(labels.softness)}
                  value={range.softness * PERCENT_SCALE}
                  min={capability.softness.min * PERCENT_SCALE}
                  max={capability.softness.max * PERCENT_SCALE}
                  tier="explicitCustom"
                  displayValue={percent(range.softness)}
                  onCommit={(value) =>
                    replaceSelected({
                      ...selected,
                      key: {
                        ...selected.key,
                        [key]: { ...range, softness: value / PERCENT_SCALE },
                      },
                    })
                  }
                />,
              ];
            })}
          </div>
          <LookTitle>{t("look.secondary.correction")}</LookTitle>
          <div className={LOOK_SLIDER_GRID}>
            {CORRECTION_CONTROLS.map(([key, labelKey, scale, suffix]) => {
              const limit = SECONDARY_CAPABILITIES.correction[key];
              const value = selected.correction[key] * scale;
              return (
                <LookSlider
                  key={key}
                  label={t(labelKey)}
                  value={value}
                  min={limit.min * scale}
                  max={limit.max * scale}
                  centerTick
                  tier={Math.abs(value) > 0.0001 ? "explicitCustom" : "default"}
                  displayValue={`${Math.round(value)}${suffix}`}
                  onCommit={(next) =>
                    replaceSelected({
                      ...selected,
                      correction: { ...selected.correction, [key]: next / scale },
                    })
                  }
                  onReset={() =>
                    replaceSelected({
                      ...selected,
                      correction: { ...selected.correction, [key]: 0 },
                    })
                  }
                />
              );
            })}
          </div>
          <PillButton variant="danger" className="w-full" onClick={removeSelected}>
            {t("look.secondary.remove")}
          </PillButton>
        </>
      )}
    </section>
  );
}
