// "Aplică la toate grupurile" on the caption Stil tab (St-Captions): copies the selection's
// position, scale and rotation to every caption group as one undo step. The store has no
// batch style action yet, so this writes the model and its history entry in one setState.
import { useCaptionStore } from "../store";
import type { CaptionStyle } from "../types";

export type CaptionTransformStyle = Pick<
  CaptionStyle,
  "x" | "y" | "scaleX" | "scaleY" | "rotation"
>;

const TRANSFORM_KEYS = ["x", "y", "scaleX", "scaleY", "rotation"] as const;

export function applyTransformToAllGroups(transform: CaptionTransformStyle): void {
  useCaptionStore.setState((state) => {
    if (!state.model) return {};
    const groups = new Map(state.model.groups);
    for (const [id, group] of groups) {
      groups.set(id, { ...group, style: { ...group.style, ...transform } });
    }
    // Segment overrides of these keys would hide the group value, so they are cleared.
    const segments = new Map(state.model.segments);
    for (const [id, segment] of segments) {
      const style: Partial<CaptionStyle> = { ...segment.style };
      for (const key of TRANSFORM_KEYS) delete style[key];
      segments.set(id, { ...segment, style });
    }
    return {
      past: [...state.past, state.model],
      future: [],
      model: { ...state.model, groups, segments },
    };
  });
}
