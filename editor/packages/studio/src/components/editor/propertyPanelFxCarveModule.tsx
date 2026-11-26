/**
 * The voiceover carve, as one module in the FX rack.
 *
 * Carve is deliberately not an entry in the chain. It is a relationship between
 * two tracks — it analyses a voice and dips *this* bed where that voice sits —
 * so it gets its own card with a source picker, the way a sidechain control
 * lives on the track being processed. What it produces is an ordinary chain of
 * peaking filters, so it composes with whatever else is on the track.
 */

import {
  defaultAudioFxParams,
  getAudioFxDef,
  type HfAudioFxNode,
  type HfAudioFxParam,
} from "@hyperframes/core/audio-fx";
import { DEFAULT_CARVE, type HfCarveSettings } from "@hyperframes/core/audio-carve";
import { fxAutomationTarget } from "@hyperframes/core/audio-automation";
import { FxParamRow } from "./propertyPanelFxControls.js";
import { FX_FAMILY_TYPE } from "./propertyPanelFxFamily.js";
import { t } from "../../i18n/translate";
import { audioText } from "./propertyPanelFxText.js";
// Shared with the timeline's lane labels: a band is named by its frequency in
// both places, and two formatters would drift.
import { formatHz } from "../../player/components/automationLaneData";

/** White row with a border (St-Inspector-AudioCarve members), no grey fill. */
const CARVE_ROW = "rounded-md bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)]";

export interface AudioTrackOption {
  id: string;
  label: string;
}

/** What one effect inside the module is called: its own name, plus the band. */
function carveMemberName(node: HfAudioFxNode): string {
  const def = getAudioFxDef(node.type);
  const freq = node.params?.["frequency"];
  const label = audioText(def?.label ?? node.type);
  return typeof freq === "number" ? `${label} ${formatHz(freq)}` : label;
}

/** A parameter's value as the rack shows it: rounded to the step, with its unit. */
function formatParamValue(param: HfAudioFxParam, raw: number | string | undefined): string {
  if (param.kind !== "number" || typeof raw !== "number") return String(raw ?? "");
  const places = param.step >= 1 ? 0 : param.step >= 0.1 ? 1 : 2;
  return `${Number(raw.toFixed(places))}${param.unit ? ` ${param.unit}` : ""}`;
}

/**
 * Width to reserve for a parameter's value, in characters.
 *
 * Derived from what the parameter CAN read rather than what it currently reads, so
 * the column never moves: an automated value updates 30 times a second, and
 * `-1 dB` is two characters narrower than `-3.2 dB`, which was enough to shunt
 * everything after it sideways on every frame. `ch` is exact here because the
 * readouts are monospace and already `tabular-nums`.
 */
function paramValueWidthCh(param: HfAudioFxParam): number {
  if (param.kind === "enum") {
    return Math.max(1, ...param.options.map((option) => option.value.length));
  }
  const places = param.step >= 1 ? 0 : param.step >= 0.1 ? 1 : 2;
  const digits = Math.max(
    String(Math.floor(Math.abs(param.min))).length,
    String(Math.floor(Math.abs(param.max))).length,
  );
  const sign = param.min < 0 ? 1 : 0;
  const decimals = places > 0 ? places + 1 : 0;
  const unit = param.unit ? param.unit.length + 1 : 0;
  return sign + digits + decimals + unit;
}

/** One member of the module: what it is, and what every knob is set to. */
function FxCarveMember({
  node,
  automatedTargets,
  liveAutomationValues,
}: {
  node: HfAudioFxNode;
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
}) {
  const def = getAudioFxDef(node.type);
  if (!def) return null;
  const params = node.params ?? defaultAudioFxParams(node.type);
  return (
    <div className={`hf-fx-carve-member flex flex-col gap-0.5 px-3.5 py-2.5 ${CARVE_ROW}`}>
      <span className="hf-fx-carve-member-name truncate text-[13px] font-semibold text-studio-text">
        {carveMemberName(node)}
      </span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {def.params.map((param) => {
          const target = node.id ? fxAutomationTarget(node.id, param.key) : null;
          const automated = Boolean(target && automatedTargets?.has(target));
          // The envelope's value at the playhead when there is one, which is what
          // the audio is using; the stored number is only the seed behind it.
          const live = target ? liveAutomationValues?.get(target) : undefined;
          const driven = automated && live !== undefined;
          const value = formatParamValue(param, driven ? live : params[param.key]);
          return (
            <span
              key={param.key}
              className="flex items-baseline gap-1 text-[12px] text-studio-muted"
              {...(automated ? { "data-automated": "" } : {})}
              {...(driven ? { "data-automation-live": "" } : {})}
            >
              <span className="text-studio-muted">{audioText(param.label)}</span>
              <span
                className="tabular-nums text-studio-text"
                style={{ minWidth: `${paramValueWidthCh(param)}ch` }}
              >
                {value}
              </span>
              {/* The lane is where an automated value comes from, and where it is
                  edited — saying so is the difference between a stale readout and
                  a pointer to the thing that owns it. */}
              {automated ? <span className="text-[var(--st-btn)]">A</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The carve, as one module in the rack.
 *
 * A carve is one thing the author switched on; the peaking filters and the level
 * stage are how it is built. Listed individually they read as hand-built effects —
 * removable one at a time, reorderable, each with knobs the next strength change
 * silently overwrites. So the rack shows the unit, and the unit owns everything
 * that means anything for it: which voice it listens to, how hard it works,
 * whether it follows that voice, and what the analysis made of it.
 *
 * The controls used to sit in their own block under the rack, which read as a
 * second, unrelated feature that happened to produce effects somewhere else. One
 * card, controls above the analysis they drive, is the same thing said once.
 *
 * Grouped is not hidden. Opening it lists every effect inside with all of its
 * settings, because an author has to be able to see where the analysis landed — as
 * readouts rather than controls, since strength is what sets them and a knob here
 * would be overwritten by the next adjustment.
 */
export function FxCarveModule({
  nodes,
  carve,
  sourceOptions,
  automatedTargets,
  liveAutomationValues,
  open,
  disabled,
  analysing,
  onToggleOpen,
  onCarveChange,
  onCarvePreview,
}: {
  nodes: HfAudioFxNode[];
  carve: HfCarveSettings;
  sourceOptions: AudioTrackOption[];
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  open: boolean;
  disabled?: boolean;
  analysing?: boolean;
  onToggleOpen(): void;
  onCarveChange(carve: HfCarveSettings): void;
  onCarvePreview(carve: HfCarveSettings): void;
}) {
  const on = carve.enabled;
  const soleVoice = soleCarveVoice(sourceOptions, carve.sources);
  const summary = carveSummary({ nodes, carve, analysing });
  // The carve's own colour, used three ways: the module's left edge, the title,
  // and the wash behind it. A preset gets a title treatment because it is a
  // character; the carve gets one because it is the only module in the rack
  // that LISTENS to another track, and a plain row understates that. It stays
  // in the smart family's monospace — what it shows is a readout, and a
  // display face would promise settings the author chose.
  return (
    <div
      className={`hf-fx-node hf-fx-carve-module hf-fx-carve flex flex-col gap-5 pb-2${
        on ? "" : " hf-fx-node-bypassed"
      }`}
      data-fx-node="carve"
      data-fx-family="smart"
      // Smart, like the Tone EQ and the leveller: it measures the audio and
      // writes its own settings, and what it shows is a readout of what it
      // decided rather than controls the author set.
      data-carve-enabled={on ? "" : undefined}
    >
      <div className="hf-fx-node-head flex min-h-11 items-center gap-3">
        <button
          type="button"
          className={`hf-fx-node-name min-w-0 flex-1 truncate text-left text-[13px] text-studio-text ${FX_FAMILY_TYPE.smart}`}
          title="Voiceover carve"
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          {audioText("Voiceover carve")}
        </button>
        <span className="hf-fx-carve-summary shrink-0 text-[12px] text-studio-muted">
          {summary}
        </span>
        {/* One switch, not a bypass and a delete. Off drops the effects and the
            envelopes it wrote, and is remembered — otherwise the default would
            re-apply the carve the next time this clip was selected. */}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={audioText("Voiceover carve")}
          className={`hf-fx-bypass hf-fx-carve-toggle relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors disabled:opacity-40 ${
            on ? "bg-studio-accent" : "bg-[var(--st-hd)]"
          }`}
          title={audioText(on ? "Switch the carve off" : "Switch the carve on")}
          disabled={disabled}
          onClick={() => onCarveChange({ ...carve, enabled: !on })}
        >
          <span
            aria-hidden="true"
            className={`h-6 w-6 rounded-full shadow-sm transition-transform ${
              on ? "translate-x-[22px] bg-studio-on-accent" : "translate-x-0.5 bg-studio-surface"
            }`}
          />
          <span className="sr-only">{t(on ? "audio.on" : "audio.off")}</span>
        </button>
      </div>
      {open && on ? (
        <div className="hf-fx-carve-body flex flex-col gap-5">
          <div className="hf-fx-carve-controls flex flex-col gap-4">
            <CarveSourceRow
              carve={carve}
              sourceOptions={sourceOptions}
              soleVoice={soleVoice}
              disabled={disabled}
              onCarveChange={onCarveChange}
            />
            {/* One knob for the whole effect. Depth, band count, width, the
                intelligibility weighting and both level-match numbers move together
                anyway — a gentle carve is shallow in few bands with little ducking, a
                hard one is deeper in more with more — so the panel sets the strength
                and `carveProfile` derives the six numbers the analysis works in. */}
            <FxParamRow
              param={{
                kind: "number",
                key: "strength",
                label: audioText("Strength"),
                unit: "",
                min: 0,
                max: 1,
                step: 0.05,
                default: DEFAULT_CARVE.strength,
                hint: "How hard to carve: deeper cuts, in more bands, and more room made by dropping the bed's level under the voice. At 0 it carves frequencies only. Moving this re-runs the analysis on what is already here.",
              }}
              value={carve.strength}
              disabled={disabled || carve.sources.length === 0}
              onChange={(_k, v) => onCarvePreview({ ...carve, strength: Number(v) })}
              onCommit={(_k, v) => onCarveChange({ ...carve, strength: Number(v) })}
            />
          </div>
          {/* What the analysis made of all that. Divided rather than boxed: these
              are parts of one module, and a border around each would read as the
              separate effects this replaced. */}
          {/* While the analysis runs, the previous filters are gone rather than
              stale. Every number in that list is about to be replaced — a strength
              change re-derives all of them — so leaving them up reads as the
              settings that are in force when they are already history, and the one
              honest thing to say is that the work is happening. */}
          <CarveAnalysis
            nodes={nodes}
            analysing={analysing}
            hasSources={carve.sources.length > 0}
            automatedTargets={automatedTargets}
            liveAutomationValues={liveAutomationValues}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The only track this bed could be listening to, when there is exactly one.
 *
 * A picker with one entry is a question with one answer: it asks the author to
 * confirm something already decided. So the voice reads out instead.
 *
 * Not when the stored source is some OTHER track, though — a name that no longer
 * classifies as a voice, or a track since renamed. Reading out the one remaining
 * candidate there would quietly claim the carve listens to something it does not,
 * so the picker comes back and shows the mismatch.
 */
function soleCarveVoice(
  sourceOptions: AudioTrackOption[],
  sources: readonly string[],
): AudioTrackOption | null {
  if (sourceOptions.length !== 1) return null;
  const only = sourceOptions[0];
  if (!only) return null;
  if (sources.length === 0) return only;
  return sources.length === 1 && sources[0] === only.id ? only : null;
}

/**
 * What the module is worth right now, for its head, so a collapsed card still
 * says whether it is doing anything: the analysis it produced, or why not.
 */
function carveSummary(input: {
  nodes: HfAudioFxNode[];
  carve: HfCarveSettings;
  analysing?: boolean;
}): string {
  const { nodes, carve, analysing } = input;
  if (!carve.enabled) return audioText("off");
  if (analysing) return audioText("analysing…");
  const bands = nodes.filter((n) => n.type === "peaking").length;
  if (bands === 0) return audioText(carve.sources.length > 0 ? "no analysis yet" : "pick a voice");
  return [
    t(bands === 1 ? "audio.carve.band" : "audio.carve.bands", { n: bands }),
    ...(nodes.some((n) => n.type === "gain") ? [audioText("level")] : []),
    // Worth saying when it is more than one: the cuts follow whoever is
    // speaking, and that is not obvious from a band count.
    ...(carve.sources.length > 1 ? [t("audio.carve.voices", { n: carve.sources.length })] : []),
  ].join(" + ");
}

/** Which voices the bed makes room for: a readout when there is only one to
 *  choose, otherwise a set of checkboxes. */
function CarveSourceRow({
  carve,
  sourceOptions,
  soleVoice,
  disabled,
  onCarveChange,
}: {
  carve: HfCarveSettings;
  sourceOptions: AudioTrackOption[];
  soleVoice: AudioTrackOption | null;
  disabled?: boolean;
  onCarveChange(carve: HfCarveSettings): void;
}) {
  return (
    <div className="hf-fx-row flex flex-col gap-2.5">
      {/* Wraps like every other name in this column (see FxParamRow) — one
          truncating row beside wrapping ones reads as a rendering bug. */}
      <span className="hf-fx-label text-[13px] font-semibold text-studio-text">
        {audioText("Listen to")}
      </span>
      {soleVoice ? (
        <span
          className={`hf-fx-carve-source flex h-11 min-w-0 items-center px-3.5 text-[13px] font-medium text-studio-text ${CARVE_ROW}`}
          data-carve-source={soleVoice.id}
        >
          {soleVoice.label}
        </span>
      ) : (
        /* Every voice, not one of them. A bed usually runs under a whole
           sequence — a narrator, an answer, a second presenter — and they are
           analysed together, so the cuts follow whoever is speaking. Which
           makes this a set of things to include, not a choice between them. */
        <div className="hf-fx-carve-sources flex min-w-0 flex-col gap-2">
          {sourceOptions.map((o) => (
            <label
              key={o.id}
              className={`flex h-11 min-w-0 cursor-pointer items-center gap-2.5 px-3.5 text-[13px] font-medium text-studio-text ${CARVE_ROW}`}
              title={`${audioText("Make room for")} ${o.label}`}
            >
              <input
                type="checkbox"
                className="hf-fx-carve-source h-4 w-4 accent-[var(--st-btn)]"
                data-carve-source={o.id}
                checked={carve.sources.includes(o.id)}
                disabled={disabled}
                onChange={(e) =>
                  onCarveChange({
                    ...carve,
                    sources: e.target.checked
                      ? [...carve.sources, o.id]
                      : carve.sources.filter((id) => id !== o.id),
                  })
                }
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What the analysis made of all that. Divided rather than boxed: these are parts
 * of one module, and a border around each would read as the separate effects
 * this replaced.
 *
 * While the analysis runs the previous filters are gone rather than stale. Every
 * number in that list is about to be replaced — a strength change re-derives all
 * of them — so leaving them up reads as the settings that are in force when they
 * are already history, and the one honest thing to say is that the work is
 * happening.
 */
function CarveAnalysis({
  nodes,
  analysing,
  hasSources,
  automatedTargets,
  liveAutomationValues,
}: {
  nodes: HfAudioFxNode[];
  analysing?: boolean;
  hasSources: boolean;
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
}) {
  if (analysing) {
    return (
      <p className="hf-fx-carve-working flex items-center justify-center gap-1.5 py-2 text-[12px] text-studio-muted">
        <svg
          className="hf-fx-carve-spinner h-3 w-3 animate-spin motion-reduce:animate-none"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        {audioText("Analysing…")}
      </p>
    );
  }
  if (nodes.length === 0) {
    return (
      <p className="hf-fx-carve-working py-1.5 text-center text-[12px] text-studio-muted">
        {audioText(
          hasSources ? "Nothing analysed yet." : "Pick the voices this bed should make room for.",
        )}
      </p>
    );
  }
  return (
    <div className="hf-fx-carve-members flex flex-col gap-2">
      <div className="hf-fx-carve-members-label text-[13px] font-semibold text-studio-text">
        {audioText("analysed")}
      </div>
      {nodes.map((node, i) => (
        <FxCarveMember
          key={node.id ?? `${node.type}-${i}`}
          node={node}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
        />
      ))}
    </div>
  );
}
