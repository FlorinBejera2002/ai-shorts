// Translated labels for the colour grade controls. The spec arrays keep their English labels
// (tests and telemetry read them); the UI asks for the label through these helpers.
import type {
  HfColorGradingAdjustKey,
  HfColorGradingDetailKey,
  HfColorGradingWheelKey,
} from "@hyperframes/core/color-grading";
import type { MessageKey } from "../../i18n/dictionary";
import { lookEffectTextEs, lookEffectTextRo } from "../../i18n/messages/lookEffects";
import { getStudioLocale, t } from "../../i18n/translate";

/** Translates a catalogue label (effect, control, preset, palette) given in English. */
export function lookText(english: string): string {
  const locale = getStudioLocale();
  if (locale === "en") return english;
  const table = locale === "es" ? lookEffectTextEs : lookEffectTextRo;
  return table[english] ?? english;
}

export function adjustLabel(key: HfColorGradingAdjustKey): string {
  return t(`look.adjust.${key}` as MessageKey);
}

export function detailLabel(key: HfColorGradingDetailKey): string {
  return t(`look.detail.${key}` as MessageKey);
}

export function wheelLabel(key: HfColorGradingWheelKey): string {
  return t(`look.wheel.${key}` as MessageKey);
}

/** Light block (St-Inspector-GradeSliders "Lumină"), then the colour block ("Culoare"). */
export const LIGHT_ADJUST_KEYS: readonly HfColorGradingAdjustKey[] = [
  "exposure",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
];
export const COLOR_ADJUST_KEYS: readonly HfColorGradingAdjustKey[] = [
  "saturation",
  "vibrance",
  "temperature",
  "tint",
];

const STATUS_KEYS: Record<string, MessageKey> = {
  "Waiting for runtime": "look.status.waiting",
  "Preview unavailable": "look.status.unavailable",
  "Save failed — reverted": "look.status.saveFailed",
  "Updating shader": "look.status.updating",
  "Shader active": "look.status.active",
  "Shader + LUT active": "look.status.activeLut",
  "No grading applied": "look.status.inactive",
  "Shader draw failed": "look.status.drawFailed",
};

/** Runtime status messages come from the controller in English; translate the known ones. */
export function gradeStatusLabel(message: string): string {
  const key = STATUS_KEYS[message];
  return key ? t(key) : message;
}
