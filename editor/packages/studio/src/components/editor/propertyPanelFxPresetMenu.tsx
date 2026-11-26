/**
 * The preset shelf for the FX rack.
 *
 * Its own module rather than another block inside the section: the section is
 * already the largest file in the panel, and this surface is going to grow —
 * search, per-item descriptions and a preview of the chain each preset draws
 * are all queued behind it.
 */

import {
  audioFxPresetsByFamily,
  HF_AUDIO_FX_PRESET_FAMILIES,
  type HfAudioFxPresetFamily,
} from "@hyperframes/core/audio-fx-presets";
import { PRESET_PROBLEM } from "@hyperframes/core/audio-fx-copy";
import { useRef } from "react";
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import { audioText } from "./propertyPanelFxText.js";
import type { HfAudioNameKind } from "@hyperframes/core/audio-carve";

/**
 * Shelf names in the author's language, which is deliberately not the effect
 * registry's grouping. `group` says what an effect *is* (filter, dynamics);
 * somebody reaching for Telephone is shopping for what they *want*, and
 * Telephone is filters and saturation — nobody looks for it under either.
 */
const FAMILY_LABEL: Record<HfAudioFxPresetFamily, MessageKey> = {
  voice: "audio.family.voice",
  repair: "audio.family.repair",
  character: "audio.family.character",
  space: "audio.family.space",
};

export interface FxPresetMenuProps {
  /**
   * What the track reads as, from its id and filename.
   *
   * Only a confident "music" or "sfx" hides anything. `unknown` keeps the whole
   * shelf, on the same principle the carve's source picker follows: a name is a
   * hint, and a shelf that hides what somebody came for is worse than a long
   * one. Nothing here is irreversible either — the cost of a wrong guess is one
   * shelf the author has to scroll past, against the cost of "My voice sounds
   * amateur" sitting on a music bed.
   */
  trackKind?: HfAudioNameKind;
  onPick(id: string): void;
  /**
   * Report that a preset was auditioned. Called at most once per preset for as
   * long as this shelf stays mounted — a pointer crossing the column passes a
   * dozen items in a second, and counting every crossing would describe mouse
   * travel rather than interest, while drowning every other event in the rack.
   */
  onAuditionTracked?(id: string): void;
  /**
   * Play this preset on the running audio without persisting it, and revert on
   * `null`. Absent when there is no preview channel to hear it through.
   */
  onAudition?(id: string | null): void;
}

/**
 * Presets read as the complaint they answer, not as their own names.
 *
 * The name is a thing you have to already know — "Telephone", "Broadcast" — and
 * the author arriving here does not know it; they know their voice sounds
 * boomy. So the sentence leads and the name follows underneath, which is also
 * how the name gets learned. The four shelves stay because eighteen sentences
 * in a column is a wall, and they are already the author's grouping rather than
 * the registry's. See `plans/audio-fx-ux/README.md` §Decided.
 */
export function FxPresetMenu({
  trackKind,
  onPick,
  onAudition,
  onAuditionTracked,
}: FxPresetMenuProps) {
  useLocale();
  // Mounted when the shelf opens and thrown away when it closes, so "once per
  // preset" resets each time the author comes back — a second visit is a second
  // look, not a duplicate of the first.
  const auditioned = useRef(new Set<string>());
  const reportAudition = (id: string) => {
    if (auditioned.current.has(id)) return;
    auditioned.current.add(id);
    onAuditionTracked?.(id);
  };
  // The voice presets all begin by cutting rumble out of a human voice and end
  // in a compressor set for speech. On a music bed that is not a mild mismatch,
  // it is the wrong instrument — and the shelf leads with the complaint, so it
  // would be offering the author a problem they do not have.
  const families =
    trackKind === "music" || trackKind === "sfx"
      ? HF_AUDIO_FX_PRESET_FAMILIES.filter((f) => f !== "voice")
      : HF_AUDIO_FX_PRESET_FAMILIES;
  return (
    <div
      className="hf-fx-preset-menu flex flex-col gap-4"
      onMouseLeave={onAudition ? () => onAudition(null) : undefined}
      onBlur={onAudition ? () => onAudition(null) : undefined}
    >
      {families.map((family) => (
        <div
          key={family}
          data-fx-preset-family={family}
          className="hf-fx-preset-group flex flex-col gap-2"
        >
          <span className="hf-fx-preset-group-label block text-[13px] font-semibold text-studio-text">
            {t(FAMILY_LABEL[family])}
          </span>
          <div
            className={family === "character" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}
          >
            {audioFxPresetsByFamily(family).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="hf-fx-preset-item block w-full rounded-md bg-studio-surface py-2.5 pr-8 pl-3.5 text-left shadow-[inset_0_0_0_1px_var(--st-bd)] hover:!bg-[var(--st-sub)] focus-visible:!bg-[var(--st-sub)] focus-visible:outline-none"
                title={`${preset.description} (${preset.nodes.length} effect${
                  preset.nodes.length === 1 ? "" : "s"
                })`}
                onClick={() => onPick(preset.id)}
                onMouseEnter={() => {
                  reportAudition(preset.id);
                  onAudition?.(preset.id);
                }}
                onFocus={() => {
                  reportAudition(preset.id);
                  onAudition?.(preset.id);
                }}
              >
                {/* The name leads (St-Inspector-AudioPresets); the complaint it answers
                    sits under it. The effect count stays for screen readers, so the
                    preset still reads as a chain the author can open. */}
                <span className="block truncate text-[13px] font-semibold text-studio-text">
                  <span className="hf-fx-preset-name">{audioText(preset.label)}</span>
                  <span className="hf-fx-preset-count sr-only">
                    {" · "}
                    {preset.nodes.length === 1
                      ? t("audio.effectCountOne")
                      : t("audio.effectCount", { n: preset.nodes.length })}
                  </span>
                </span>
                <span className="hf-fx-preset-problem mt-0.5 block text-[12px] leading-4 text-studio-muted">
                  {audioText(PRESET_PROBLEM[preset.id] ?? preset.description)}
                </span>
                {onAudition ? (
                  <span className="hf-fx-preset-wave" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
