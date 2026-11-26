/**
 * One effect in the FX rack: its header controls, and its knobs when open.
 *
 * An entry in the chain, as opposed to a composite module — the carve and the
 * Tone EQ own several nodes each and have their own files.
 *
 * The row speaks the author's language, not the registry's. `EFFECT_COPY`
 * supplies the name and every knob's name, `SUMMARY` the sentence under it, and
 * the DSP name moves inside — it is a fact about the mechanism, so it belongs
 * with the mechanism. See `plans/audio-fx-ux/README.md` §Decided.
 */

import { useMemo, useState } from "react";
import {
  defaultAudioFxParams,
  getAudioFxDef,
  type HfAudioFxDef,
  type HfAudioFxNode,
  type HfAudioFxParam,
  type HfAudioFxParamValues,
} from "@hyperframes/core/audio-fx";
import { EFFECT_COPY, SUMMARY } from "@hyperframes/core/audio-fx-copy";
import { trackNodeBypassed } from "./audioFxTelemetry.js";
import { getAudioFxProfile } from "@hyperframes/core/audio-fx-profiles";
import { getStudioLocale, t, useLocale } from "../../i18n/translate";
import { FX_FAMILY_TYPE, fxFamilyOf } from "./propertyPanelFxFamily.js";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";
import { audioText } from "./propertyPanelFxText.js";
import { FxNodeOpenBody } from "./propertyPanelFxNodeOpenBody.js";

/**
 * The one control that carries the module, if it has one.
 *
 * "Two faces": a module opens on its name, a line about what it is for, and one
 * knob — the rest is one click away and never in the way. Nothing is hidden; it
 * is ordered.
 *
 * `primary` is either a real parameter key or the string "strength", which means
 * the module wants a single DERIVED control over several parameters — the
 * `PROFILES` idea, whose figures are proposed rather than measured and which has
 * not shipped. Until it does, those five effects (compressor, gate, saturate,
 * reverb, bitcrush) open on all of their controls, which is honest: the one knob
 * they want does not exist yet, and inventing one would be a knob that lies.
 */
function primaryParamOf(def: HfAudioFxDef): string | null {
  const primary = EFFECT_COPY[def.id]?.primary;
  // "strength" names no real parameter, and for the five effects that declare it
  // that is the point: their one knob is derived, and `profileRow` below builds
  // it. Anything else has to be a parameter the effect actually has.
  if (!primary || primary === "strength") return null;
  return def.params.some((p) => p.key === primary) ? primary : null;
}

/**
 * The derived knob, as a parameter the existing controls can render.
 *
 * A profile is not in the registry — it sets five real parameters and is none of
 * them — so this fabricates the one row it needs rather than teaching `FxParams`
 * about a second kind of control. 0..1 in hundredths, the same shape and the
 * same feel as the carve's Strength.
 */
function profileParam(type: string): HfAudioFxParam | null {
  const profile = getAudioFxProfile(type);
  if (!profile) return null;
  return {
    kind: "number",
    key: "strength",
    label: profile.label,
    unit: "",
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    hint: `Sets ${profile.derives.length} settings at once. Open Details to see where they land.`,
  };
}

/**
 * The registry's definition with the plain names written over it.
 *
 * Over rather than instead of: the registry stays the authority on range, step,
 * unit and what is automatable, and only the words change. A parameter with no
 * copy keeps its own label rather than disappearing — `audioFxCopy.test.ts` is
 * what makes sure there is never one.
 */
function plainDef(def: HfAudioFxDef): HfAudioFxDef {
  const copy = EFFECT_COPY[def.id];
  if (!copy) return def;
  return {
    ...def,
    params: def.params.map((param) => {
      const plain = copy.params[param.key];
      if (!plain) return { ...param, label: audioText(param.label) };
      // The registry's hint explains the mechanism, which is still the better
      // tooltip than none — but the plain one wins where it exists.
      return {
        ...param,
        label: audioText(plain.label),
        ...(plain.hint ? { hint: plain.hint } : {}),
      };
    }),
  };
}

interface FxNodeRowProps {
  node: HfAudioFxNode;
  index: number;
  /** Where it sits in the signal path, as the rack counts it. Absent means unnumbered. */
  position?: number;
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  onAutomateParam?(nodeId: string, paramKey: string): void;
  onRemoveParamAutomation?(nodeId: string, paramKey: string): void;
  open: boolean;
  /** Last in the chain, so it cannot move further down. */
  last: boolean;
  disabled?: boolean;
  onToggleOpen(): void;
  onUpdate(index: number, patch: Partial<HfAudioFxNode>): void;
  onMove(index: number, delta: number): void;
  onRemove(index: number): void;
  onPreview(index: number, params: HfAudioFxParamValues): void;
  /** What the track reads as, carried onto this row own events. */
  trackKind?: string;
}

/** Reorder arrow. Disabled at the end of the chain it would move past. */
function FxMoveButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="hf-fx-move inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-sub)] disabled:opacity-25"
      title={label}
      aria-label={t(glyph === "up" ? "audio.moveUp" : "audio.moveDown")}
      disabled={disabled}
      onClick={onClick}
    >
      <LookIcon d={glyph === "up" ? LOOK_ICONS.up : LOOK_ICONS.down} />
    </button>
  );
}

/** Name, bypass, reorder and remove for one effect. */
function FxNodeHeader({
  label,
  family,
  position,
  open,
  bypassed,
  first,
  last,
  disabled,
  onToggleOpen,
  onToggleBypass,
  onMove,
  onRemove,
}: {
  label: string;
  /** How this family letters, so the KIND reads before the word does. */
  family: string;
  position?: number;
  open: boolean;
  bypassed: boolean;
  first: boolean;
  last: boolean;
  disabled?: boolean;
  onToggleOpen(): void;
  onToggleBypass(): void;
  onMove(delta: number): void;
  onRemove(): void;
}) {
  return (
    <div className="hf-fx-node-head flex min-h-[52px] items-center gap-1 py-1.5 pr-2 pl-3.5">
      {/* Two digits, because a rack reads as a path when its steps are numbered
          and as a list when they are not — and the difference decides whether an
          author thinks the order matters. It does; it is audible. */}
      {/* St-Inspector-AudioRack rows carry no step number: the breadcrumb and the family
          headings above say where a row sits in the path. The position stays for screen readers. */}
      {position !== undefined ? (
        <span className="hf-fx-node-index sr-only">{String(position).padStart(2, "0")}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          className={`hf-fx-node-name truncate text-left text-[13px] text-studio-text ${family}`}
          // Truncated in the same narrow column as the param labels below, so it
          // needs the same fallback to the full text on hover.
          title={label}
          aria-expanded={open}
          onClick={onToggleOpen}
        >
          {audioText(label)}
        </button>
        <span className="hf-fx-node-state text-[12px] text-studio-muted">
          {t(bypassed ? "audio.bypassed" : "audio.active")}
        </span>
      </span>
      <FxMoveButton
        label="Move up"
        glyph="up"
        disabled={Boolean(disabled) || first}
        onClick={() => onMove(-1)}
      />
      <FxMoveButton
        label="Move down"
        glyph="down"
        disabled={Boolean(disabled) || last}
        onClick={() => onMove(1)}
      />
      <button
        type="button"
        className={`hf-fx-bypass inline-flex h-9 flex-none items-center rounded-full px-3 text-[12px] font-semibold text-studio-text disabled:opacity-40 ${
          bypassed
            ? "shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
            : "bg-[var(--st-sub)] hover:shadow-[inset_0_0_0_1.5px_var(--st-sbd)]"
        }`}
        aria-pressed={bypassed}
        title={bypassed ? "Enable" : "Bypass"}
        disabled={disabled}
        onClick={onToggleBypass}
      >
        {t(bypassed ? "audio.enable" : "audio.bypass")}
      </button>
      <button
        type="button"
        className="hf-fx-remove inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-danger-bg)] hover:text-studio-danger disabled:opacity-40"
        title="Remove"
        aria-label={t("audio.remove")}
        disabled={disabled}
        onClick={onRemove}
      >
        <LookIcon d={LOOK_ICONS.trash} />
      </button>
    </div>
  );
}

/** One effect in the chain: its header controls, and its knobs when open. */
export function FxNodeRow({
  node,
  index,
  position,
  automatedTargets,
  liveAutomationValues,
  onAutomateParam,
  onRemoveParamAutomation,
  open,
  last,
  disabled,
  onToggleOpen,
  onUpdate,
  onMove,
  onRemove,
  onPreview,
  trackKind,
}: FxNodeRowProps) {
  const locale = useLocale();
  const registryDef = getAudioFxDef(node.type);
  // The locale is a dependency because plainDef translates the names.
  const def = useMemo(
    () => (registryDef ? plainDef(registryDef) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registryDef, locale],
  );
  const primary = registryDef ? primaryParamOf(registryDef) : null;
  /**
   * The derived knob, for a module with no real parameter that can be its face.
   *
   * It behaves like the primary one everywhere below — one control on the open
   * face, everything it sets behind Details — so the two are the same shape and
   * only their source differs.
   */
  const profile = getAudioFxProfile(node.type);
  const derived = useMemo(() => profileParam(node.type), [node.type]);
  /** The same def cut down to the one knob, so the open face reuses every wire. */
  const onlyPrimary = useMemo(
    () => (def && primary ? { ...def, params: def.params.filter((p) => p.key === primary) } : def),
    [def, primary],
  );
  // Local, because nothing outside the row needs to know. Keyed by node id like
  // the row itself, so it stays with its effect across a reorder.
  const [details, setDetails] = useState(false);
  if (!registryDef || !def || !onlyPrimary) return null;
  const oneKnob = primary !== null || derived !== null;
  const copy = EFFECT_COPY[node.type];
  const bypassed = node.enabled === false;
  const params = node.params ?? defaultAudioFxParams(node.type);
  // What this effect is doing to the sound, as a sentence. The rack is read top
  // to bottom far more often than any one module is opened, so this is the line
  // that decides whether an author can follow their own mix.
  const summary = SUMMARY[node.type]?.(params);
  return (
    <div
      className={`hf-fx-node rounded-md bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)]${bypassed ? " hf-fx-node-bypassed" : ""}`}
      data-fx-node={node.type}
      data-fx-family={fxFamilyOf(node)}
      // The scroll anchor a revealed automation lane lands on. Keyed by node id
      // rather than by parameter: every param of one effect lives in this row,
      // so the row is the smallest thing worth scrolling to.
      data-fx-node-id={node.id}
      // The tint is on the edge rather than the text: the name already carries
      // the family in its lettering, and colouring it too would fight the
      // panel's own tokens for automated and bypassed.
    >
      <FxNodeHeader
        family={FX_FAMILY_TYPE[fxFamilyOf(node)]}
        position={position}
        // The node's own job name when a preset gave it one, because that is the
        // most specific truth available: a chain that cuts mud and then lifts
        // clarity must not show the same name twice. Then the plain name, and
        // the registry's only if an effect somehow has no copy.
        label={node.label ?? EFFECT_COPY[node.type]?.title ?? registryDef.label}
        open={open}
        bypassed={bypassed}
        first={index === 0}
        last={last}
        disabled={disabled}
        onToggleOpen={onToggleOpen}
        onToggleBypass={() => {
          trackNodeBypassed(node.type, !bypassed, { trackKind });
          onUpdate(index, { enabled: bypassed });
        }}
        onMove={(delta) => onMove(index, delta)}
        onRemove={() => onRemove(index)}
      />
      {/* The sentence of what it does is English copy from Core; rows show a title and a
          state only (St-Inspector-AudioRack), so it stays available to assistive tech. */}
      {summary && getStudioLocale() === "en" ? (
        <p className="hf-fx-node-summary sr-only">{summary}</p>
      ) : null}
      {open ? (
        <FxNodeOpenBody
          node={node}
          registryDef={registryDef}
          def={def}
          onlyPrimary={onlyPrimary}
          primary={primary}
          derived={derived}
          profile={profile}
          oneKnob={oneKnob}
          details={details}
          onToggleDetails={() => setDetails((was) => !was)}
          copy={copy}
          params={params}
          index={index}
          disabled={disabled}
          bypassed={bypassed}
          automatedTargets={automatedTargets}
          liveAutomationValues={liveAutomationValues}
          onUpdate={onUpdate}
          onPreview={onPreview}
          onAutomateParam={onAutomateParam}
          onRemoveParamAutomation={onRemoveParamAutomation}
          trackKind={trackKind}
        />
      ) : null}
    </div>
  );
}
