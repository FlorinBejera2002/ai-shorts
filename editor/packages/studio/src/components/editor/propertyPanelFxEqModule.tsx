/**
 * The Tone module: a multi-band EQ as one control surface over several nodes.
 *
 * Faders rather than the rack's usual horizontal sliders, because a row of them
 * around a centre detent is what an equaliser looks like to everybody who has
 * met one. Recognising the control is most of the value — an author who has
 * never opened a mixer has still used bass, middle and treble.
 */

import { useCallback, useEffect, useState } from "react";
import {
  audioEqSummary,
  HF_AUDIO_EQ_RANGE_DB,
  type HfAudioEqBand,
} from "@hyperframes/core/audio-fx-eq";
import { FX_FAMILY_TYPE } from "./propertyPanelFxFamily.js";
import { audioText } from "./propertyPanelFxText.js";
import { t } from "../../i18n/translate";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";

export interface FxEqModuleProps {
  eqId: string;
  bands: HfAudioEqBand[];
  open: boolean;
  disabled?: boolean;
  onToggleOpen(): void;
  /** Dragging: heard immediately, not persisted. */
  onPreview(bandName: string, gain: number): void;
  /** Release: the write that persists. */
  onCommit(bandName: string, gain: number): void;
  onRemove(): void;
}

/** Fader travel as a percentage from the top, with 0 dB at the centre. */
function offsetFor(gain: number): number {
  const clamped = Math.max(-HF_AUDIO_EQ_RANGE_DB, Math.min(HF_AUDIO_EQ_RANGE_DB, gain));
  return 50 - (clamped / (HF_AUDIO_EQ_RANGE_DB * 2)) * 100;
}

const shown = (gain: number): string => {
  const v = Number(gain.toFixed(1));
  return v > 0 ? `+${v}` : String(v);
};

function Fader({
  band,
  disabled,
  onPreview,
  onCommit,
}: {
  band: HfAudioEqBand;
  disabled?: boolean;
  onPreview(gain: number): void;
  onCommit(gain: number): void;
}) {
  /**
   * Held locally for the length of the gesture.
   *
   * The module is driven by the chain, and dragging only PREVIEWS — it does
   * not write — so a purely controlled input re-renders back to the old value
   * on the first move and the fader snaps out from under the pointer. Same
   * split the rack's other controls already make.
   */
  const [local, setLocal] = useState(band.gain);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setLocal(band.gain);
  }, [band.gain, dragging]);

  const value = dragging ? local : band.gain;
  const pct = offsetFor(value);
  const moved = Math.abs(value) >= 0.05;

  const move = (next: number) => {
    setDragging(true);
    setLocal(next);
    onPreview(next);
  };
  const settle = () => {
    if (!dragging) return;
    setDragging(false);
    onCommit(local);
  };

  // A range input rotated into a fader: it keeps keyboard control, focus and
  // the platform's own pointer handling, which a div with pointer events would
  // all have to reimplement badly.
  return (
    <div className="hf-fx-eq-band flex min-w-0 flex-1 flex-col items-center gap-1">
      <div className="relative h-[74px] w-full">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--st-bd)]" />
        <span
          className="pointer-events-none absolute left-1/2 w-[3px] -translate-x-1/2 rounded-sm bg-studio-accent"
          style={
            // `value`, not `band.gain`: mid-drag across zero the fill would
            // otherwise keep pointing the way it started.
            value >= 0 ? { top: `${pct}%`, bottom: "50%" } : { top: "50%", bottom: `${100 - pct}%` }
          }
        />
        <input
          className="hf-fx-eq-fader absolute left-1/2 h-[19px] w-[74px] -translate-x-1/2 -translate-y-1/2 rotate-[-90deg] cursor-ns-resize appearance-none bg-transparent"
          style={{ top: "50%" }}
          type="range"
          min={-HF_AUDIO_EQ_RANGE_DB}
          max={HF_AUDIO_EQ_RANGE_DB}
          step={0.5}
          value={value}
          disabled={disabled}
          aria-label={`${band.name} ${shown(value)} dB`}
          onChange={(e) => move(Number(e.target.value))}
          onPointerUp={settle}
          onKeyUp={settle}
          onBlur={settle}
        />
      </div>
      <span className="hf-fx-eq-name w-full truncate text-center text-[11px] uppercase tracking-wide text-studio-muted">
        {band.name}
      </span>
      <span
        className={`hf-fx-eq-value text-[11px] tabular-nums ${
          moved ? "text-studio-text" : "text-studio-muted"
        }`}
      >
        {moved ? shown(value) : "0"}
      </span>
    </div>
  );
}

export function FxEqModule({
  eqId,
  bands,
  open,
  disabled,
  onToggleOpen,
  onPreview,
  onCommit,
  onRemove,
}: FxEqModuleProps) {
  const preview = useCallback((name: string, gain: number) => onPreview(name, gain), [onPreview]);
  const commit = useCallback((name: string, gain: number) => onCommit(name, gain), [onCommit]);

  return (
    <div
      className="hf-fx-node hf-fx-eq-module rounded-md bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)]"
      data-fx-node="eq"
      data-fx-family="smart"
      // Scroll anchor for a revealed EQ-band automation lane.
      data-fx-eq={eqId}
      // Smart, with the carve and the leveller: three bands the author sets by
      // ear on a control surface, not three filters they configured.
    >
      {/* St-Inspector-AudioRack row: the name over a one-line state, then the remove action. */}
      <div className="hf-fx-node-head flex min-h-[52px] items-center gap-1 py-1.5 pr-2 pl-3.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            className={`hf-fx-node-name truncate text-left text-[13px] text-studio-text ${FX_FAMILY_TYPE.smart}`}
            aria-expanded={open}
            onClick={onToggleOpen}
          >
            {audioText("Tone")}
          </button>
          <span className="hf-fx-eq-summary truncate text-[12px] text-studio-muted">
            {audioText(audioEqSummary(bands))}
          </span>
        </span>
        <button
          type="button"
          className="hf-fx-remove inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-danger-bg)] hover:text-studio-danger disabled:opacity-40"
          aria-label="Remove Tone"
          title={t("audio.remove")}
          disabled={disabled}
          onClick={onRemove}
        >
          <LookIcon d={LOOK_ICONS.trash} />
        </button>
      </div>

      {open ? (
        <div className="hf-fx-eq-body px-2 pb-2">
          <div className="flex gap-1.5">
            {bands.map((band) => (
              <Fader
                key={band.name}
                band={band}
                disabled={disabled}
                onPreview={(g) => preview(band.name, g)}
                onCommit={(g) => commit(band.name, g)}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[12px] tracking-wide text-studio-muted">
            <span>{audioText("CUT")}</span>
            <span>{audioText("BOOST")}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
