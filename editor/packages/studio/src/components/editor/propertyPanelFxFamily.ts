/**
 * Telling module families apart before the word registers.
 *
 * A rack of eight modules is eight lines of text, and reading it top to bottom
 * means reading eight names. Lettering each family differently means an author
 * knows what KIND of module they are looking at with the label out of focus —
 * the shape of the line carries it, and the word only confirms.
 *
 * Two faces of type, as budgeted in `plans/audio-fx-ux/README.md`: the sans
 * carries four families apart by weight, case and tracking, and the serif is
 * spent on the single family that behaves differently from all of them.
 * Non-linear is the only generative one — it invents signal rather than
 * measuring or shaping what is there — so it should not look like the others.
 *
 * Alongside it, a tint step per module WITHIN its family, derived from position
 * in the registry rather than assigned by hand: two filters read as two
 * different modules without reading as two different families, and adding an
 * effect upstream never re-colours its siblings.
 */

import { HF_AUDIO_FX, type HfAudioFxNode } from "@hyperframes/core/audio-fx";

export type FxFamily = "filter" | "dynamics" | "nonlinear" | "time" | "smart";

/**
 * How each family letters.
 *
 * `smart` is not a registry group. It is the measuring modules — the carve, the
 * Tone EQ, the leveller — which analyse the audio and write their own settings.
 * Monospace because that is what a readout looks like, and what they show IS a
 * readout: numbers something else decided.
 */
export const FX_FAMILY_TYPE: Record<FxFamily, string> = {
  // St-Inspector-AudioRack: one sans treatment for every family (app palette and type only).
  filter: "font-semibold",
  dynamics: "font-semibold",
  nonlinear: "font-semibold",
  time: "font-semibold",
  smart: "font-semibold",
};

/**
 * Which family a chain node belongs to.
 *
 * The composite tags win over the registry group, because what a node IS to the
 * author is the module that owns it: a carve's peaking filters are not filters
 * the author added, they are one carve.
 */
export function fxFamilyOf(
  node: Pick<HfAudioFxNode, "type" | "fromCarve" | "fromEq" | "fromLeveller">,
): FxFamily {
  if (node.fromCarve || node.fromEq || node.fromLeveller) return "smart";
  const group = HF_AUDIO_FX.find((def) => def.id === node.type)?.group;
  return group === "dynamics" || group === "nonlinear" || group === "time" ? group : "filter";
}
