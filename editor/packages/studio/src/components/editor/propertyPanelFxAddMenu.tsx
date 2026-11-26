/**
 * The add-effect shelf: Tone, the composite jobs, and the raw registry.
 *
 * Split out of `propertyPanelFxSection.tsx`'s `{adding ? (...) : null}` block —
 * the section owns the audition/chain plumbing this shelf drives, and passes it
 * straight through.
 */

import {
  getAudioFxDef,
  HF_AUDIO_FX,
  type HfAudioFxChain,
  type HfAudioFxGroup,
} from "@hyperframes/core/audio-fx";
import {
  HF_AUDIO_FX_JOBS,
  HF_AUDIO_FX_JOB_TYPES,
  type HfAudioFxJob,
} from "@hyperframes/core/audio-fx-jobs";
import { EFFECT_COPY } from "@hyperframes/core/audio-fx-copy";
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import { audioText } from "./propertyPanelFxText.js";

const GROUP_ORDER: HfAudioFxGroup[] = ["filter", "dynamics", "nonlinear", "time"];
const GROUP_LABEL: Record<HfAudioFxGroup, MessageKey> = {
  filter: "audio.group.filter",
  dynamics: "audio.group.dynamics",
  nonlinear: "audio.group.nonlinear",
  time: "audio.group.time",
};

// St-Inspector-AudioAdd: a card with two columns of groups; items are plain text rows.
const GROUP_LABEL_CLASS =
  "hf-fx-add-group-label mb-1 block text-[12px] font-medium text-studio-muted";
const ITEM_CLASS =
  "-mx-2 rounded-sm px-2 py-1.5 text-left text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)] focus-visible:bg-[var(--st-sub)] focus-visible:outline-none disabled:opacity-40";

/**
 * The add menu, with the jobs standing in for the effect they are made of.
 *
 * `peaking` is not offered as itself: picking it is picking a machine and
 * leaving the real decision — which range — for afterwards. The jobs are that
 * decision, already made. See `audioFxJobs.ts`.
 *
 * Computed once at module scope, not per render: it has no dependency on props
 * or state, just the static effect registry.
 */
const GROUPED = GROUP_ORDER.map((g) => ({
  group: g,
  defs: HF_AUDIO_FX.filter((d) => d.group === g && !HF_AUDIO_FX_JOB_TYPES.has(d.id)),
  jobs: HF_AUDIO_FX_JOBS.filter((job) => getAudioFxDef(job.type)?.group === g),
}));

export interface FxAddMenuProps {
  disabled?: boolean;
  analysing?: boolean;
  levelled?: boolean;
  auditioningLevel?: boolean;
  /** Measure this track and write the levelling lane. Absent when unavailable. */
  onLevel?(): void;
  /** Take the levelling stage and its lane back out. */
  onRemoveLevel?(): void;
  onEq(): void;
  onJob(job: HfAudioFxJob): void;
  onEffect(type: string): void;
  /** The shelf just picked something, or the levelling button did its own close. */
  onClose(): void;
  /** Play a hypothetical chain without committing to it, or `null` to stop. */
  audition(make: ((base: HfAudioFxChain) => HfAudioFxChain) | null): void;
  onAuditionLevel?(on: boolean): void;
  withJob(base: HfAudioFxChain, job: HfAudioFxJob): HfAudioFxChain;
  withEffect(base: HfAudioFxChain, type: string): HfAudioFxChain;
}

/** The shelf `adding` opens: Tone, the named jobs, and the raw effect registry. */
export function FxAddMenu({
  disabled,
  analysing,
  levelled,
  auditioningLevel,
  onLevel,
  onRemoveLevel,
  onEq,
  onJob,
  onEffect,
  onClose,
  audition,
  onAuditionLevel,
  withJob,
  withEffect,
}: FxAddMenuProps) {
  useLocale();
  const resetAudition = () => {
    audition(null);
    onAuditionLevel?.(false);
  };
  return (
    <div
      className="hf-fx-add-menu grid grid-cols-2 gap-x-3 gap-y-4 rounded-card bg-studio-surface p-4 shadow-studio"
      onMouseLeave={resetAudition}
      onBlur={resetAudition}
    >
      <div className="hf-fx-add-group flex flex-col">
        <span className={GROUP_LABEL_CLASS}>{t("audio.tone")}</span>
        {onLevel ? (
          <button
            type="button"
            className={`hf-fx-add-composite ${ITEM_CLASS}`}
            title="Listen to this track and even out its loud and quiet parts."
            disabled={disabled || analysing}
            onClick={() => {
              if (levelled) onRemoveLevel?.();
              else onLevel();
              onClose();
            }}
            onMouseEnter={
              levelled
                ? undefined
                : () => {
                    audition(null);
                    onAuditionLevel?.(true);
                  }
            }
            onFocus={levelled ? undefined : () => onAuditionLevel?.(true)}
          >
            {levelled ? t("audio.removeLevelling") : t("audio.evenOut")}
            {auditioningLevel ? (
              <span className="hf-fx-add-working text-studio-muted">{t("audio.measuring")}</span>
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          className={`hf-fx-add-composite ${ITEM_CLASS}`}
          title="Bass, middle and treble on one set of faders."
          onMouseEnter={resetAudition}
          onClick={onEq}
        >
          {t("audio.toneEq")}
        </button>
      </div>
      {GROUPED.map(({ group, defs, jobs }) => (
        <div key={group} className="hf-fx-add-group flex flex-col">
          <span className={GROUP_LABEL_CLASS}>{t(GROUP_LABEL[group])}</span>
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              className={`hf-fx-add-item ${ITEM_CLASS}`}
              title={job.does}
              onClick={() => onJob(job)}
              onMouseEnter={() => {
                onAuditionLevel?.(false);
                audition((base) => withJob(base, job));
              }}
              onFocus={() => audition((base) => withJob(base, job))}
            >
              {audioText(job.label)}
            </button>
          ))}
          {defs.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`hf-fx-add-item ${ITEM_CLASS}`}
              title={EFFECT_COPY[d.id] ? `${EFFECT_COPY[d.id]?.does} (${d.label})` : d.description}
              onClick={() => onEffect(d.id)}
              onMouseEnter={() => {
                onAuditionLevel?.(false);
                audition((base) => withEffect(base, d.id));
              }}
              onFocus={() => audition((base) => withEffect(base, d.id))}
            >
              {audioText(EFFECT_COPY[d.id]?.title ?? d.label)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
