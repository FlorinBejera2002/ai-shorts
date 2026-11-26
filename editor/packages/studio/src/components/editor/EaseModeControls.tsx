/**
 * Ease editor mode primitives: the mode radio group and the preset grid.
 *
 * Split out of `EaseCurveSection.tsx` to keep it under the 600-line cap
 * (CI's file size check). Both components are presentational and stateless —
 * they take the current selection and emit a committed ease string — so they
 * carry the mode vocabulary (`EASE_MODES`, labels, per-mode defaults) with
 * them rather than importing it back from the parent.
 */

import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { easePresetDisplayLabel } from "./motionUi";
import { EASE_PRESETS } from "./easePresetLibrary";
import { MiniCurveSvg } from "./easeCurveSvg";
import { EASE_CURVES } from "./gsapAnimationConstants";

const EASE_MODES = ["curve", "spring", "wiggle"] as const;
export type EaseMode = (typeof EASE_MODES)[number];

export type Pts = [number, number, number, number];
export const DEFAULT_CURVE: Pts = EASE_CURVES["power2.out"];

const MODE_KEYS = {
  curve: "ease.mode.curve",
  spring: "ease.mode.spring",
  wiggle: "ease.mode.wiggle",
} as const satisfies Record<EaseMode, MessageKey>;

/** The localised name of an ease editor mode (Curbă / Arc / Oscilație). */
export function easeModeLabel(mode: EaseMode): string {
  return t(MODE_KEYS[mode]);
}

const DEFAULT_EASE_BY_MODE = {
  curve: `custom(M0,0 C${DEFAULT_CURVE[0]},${DEFAULT_CURVE[1]} ${DEFAULT_CURVE[2]},${DEFAULT_CURVE[3]} 1,1)`,
  spring: "spring(0.42)",
  wiggle: "wiggle(3,easeInOut,0.12)",
} satisfies Record<EaseMode, string>;

export const EasePresetGrid = function EasePresetGrid({
  kind,
  currentEase,
  onSelect,
}: {
  kind: EaseMode;
  currentEase: string;
  onSelect: (ease: string) => void;
}) {
  return (
    <div className="mb-2 grid max-h-56 grid-cols-4 gap-1 overflow-y-auto pr-0.5">
      {EASE_PRESETS.filter((preset) => preset.kind === kind).map((preset) => {
        const isActive = currentEase === preset.ease;
        return (
          <button
            key={preset.id}
            type="button"
            data-ease-preset-id={preset.id}
            role="menuitemradio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(preset.ease)}
            className={`flex flex-col items-center gap-0.5 rounded-md p-1 transition-colors ${
              isActive
                ? "shadow-[inset_0_0_0_2px_var(--st-tx)]"
                : "shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
            }`}
            title={preset.label}
          >
            <MiniCurveSvg ease={preset.ease} active={isActive} />
            <span
              className={`text-center text-[10px] leading-none ${
                isActive ? "font-semibold text-studio-text" : "text-studio-muted"
              }`}
            >
              {easePresetDisplayLabel(preset)}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export function EaseModeToggle({
  mode,
  onCommit,
}: {
  mode: EaseMode;
  onCommit: (ease: string) => void;
}) {
  return (
    <div
      className="mb-2 grid grid-cols-3 gap-0.5 rounded-full bg-studio-surface p-1 shadow-[inset_0_0_0_1.5px_var(--st-bd)]"
      role="radiogroup"
      aria-label="Ease editor mode"
    >
      {EASE_MODES.map((candidateMode) => {
        const active = candidateMode === mode;
        return (
          <button
            key={candidateMode}
            type="button"
            data-ease-mode={candidateMode}
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (active) return;
              onCommit(DEFAULT_EASE_BY_MODE[candidateMode]);
            }}
            className={`h-8 rounded-full px-2 text-xs font-medium transition-colors ${
              active
                ? "bg-studio-selected font-semibold text-studio-on-selected"
                : "text-studio-text hover:bg-[var(--st-sub)]"
            }`}
          >
            {easeModeLabel(candidateMode)}
          </button>
        );
      })}
    </div>
  );
}
