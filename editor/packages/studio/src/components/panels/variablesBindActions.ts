/**
 * Bind-action model for the Variables "bind selected element" card: which
 * properties of the selected element can be promoted to variables, the
 * declaration each one creates, and the batched schema edit that applies it.
 * The card UI lives in VariablesBindElement.tsx.
 */

import type { Composition, CompositionVariable } from "@hyperframes/sdk";
import type { DomEditSelection } from "../editor/domEditingTypes";
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

// <source> is deliberately excluded: rewriting a <source> child's src after
// the parent media element ran resource selection is a spec no-op.
const MEDIA_TAGS = new Set(["img", "video", "audio"]);

export interface BindAction {
  key: string;
  label: string;
  /** Binding channel: data-var-src / data-var-text attribute, or a style prop. */
  kind: "src" | "text" | "style";
  styleProp?: string;
  suggestedId: string;
  declaration: (id: string) => CompositionVariable;
}

export function sanitizeId(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "variable";
}

/**
 * "rgb(0, 195, 255)" / "rgba(0, 195, 255, 0.4)" → "#00c3ff". Alpha is dropped
 * (color variables are hex) — a fully transparent computed color maps to
 * #000000, which the picker can at least display. Unrecognized formats pass
 * through verbatim.
 */
export function rgbToHex(value: string): string {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(value);
  if (!m) return value;
  return `#${m
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
}

function firstFontFamily(value: string): string {
  const first = value.split(",")[0] ?? "";
  return first.trim().replace(/^["']|["']$/g, "") || "sans-serif";
}

/** Media binding: the src of an img/video/audio element. */
function mediaBindAction(
  selection: DomEditSelection,
  tag: string,
  base: string,
  currentSrc: string,
): BindAction {
  return {
    key: "src",
    label: tag === "img" ? "Image source" : "Media source",
    kind: "src",
    suggestedId: base,
    declaration: (id) =>
      tag === "img"
        ? { id, type: "image", label: `${selection.label} image`, default: currentSrc }
        : { id, type: "string", label: `${selection.label} source`, default: currentSrc },
  };
}

/** Text binding: only offered for leaf elements (see buildBindActions). */
function textBindAction(selection: DomEditSelection, base: string, text: string): BindAction {
  return {
    key: "text",
    label: "Text",
    kind: "text",
    suggestedId: `${base}-text`,
    declaration: (id) => ({
      id,
      type: "string",
      label: `${selection.label} text`,
      default: text,
    }),
  };
}

/** Computed-style bindings: text color, background and font family. */
function styleBindActions(selection: DomEditSelection, base: string): BindAction[] {
  const computed = selection.computedStyles;
  return [
    {
      key: "color",
      label: "Text color",
      kind: "style",
      styleProp: "color",
      suggestedId: `${base}-color`,
      declaration: (id) => ({
        id,
        type: "color",
        label: `${selection.label} color`,
        default: rgbToHex(computed["color"] ?? "#000000"),
      }),
    },
    {
      key: "background",
      label: "Background",
      kind: "style",
      styleProp: "background-color",
      suggestedId: `${base}-bg`,
      declaration: (id) => ({
        id,
        type: "color",
        label: `${selection.label} background`,
        default: rgbToHex(computed["background-color"] ?? "#000000"),
      }),
    },
    {
      key: "font",
      label: "Font",
      kind: "style",
      styleProp: "font-family",
      suggestedId: `${base}-font`,
      declaration: (id) => ({
        id,
        type: "font",
        label: `${selection.label} font`,
        default: firstFontFamily(computed["font-family"] ?? "sans-serif"),
      }),
    },
  ];
}

// fallow-ignore-next-line complexity
export function buildBindActions(
  selection: DomEditSelection,
  sdkSession: Composition,
): BindAction[] {
  const hfId = selection.hfId;
  if (!hfId) return [];
  // No snapshot = the session can't resolve this element (e.g. a sub-comp
  // element that missed the source map) — a bind would target the wrong
  // document or dead-end, so offer nothing.
  const snapshot = sdkSession.getElement(hfId);
  if (!snapshot) return [];
  const base = sanitizeId(snapshot.attributes.id ?? selection.label ?? hfId);
  const actions: BindAction[] = [];

  const tag = selection.tagName.toLowerCase();
  if (MEDIA_TAGS.has(tag)) {
    actions.push(mediaBindAction(selection, tag, base, snapshot.attributes.src ?? ""));
  }

  // Text binds only on leaf elements: the runtime preserves children, but a
  // container's "own text" default rarely matches what the user sees, so the
  // promote-never-changes-the-render guarantee only holds for leaves.
  const text = (snapshot.text ?? "").trim();
  if (text && snapshot.children.length === 0 && !selection.isCompositionHost) {
    actions.push(textBindAction(selection, base, text));
  }

  if (selection.capabilities.canEditStyles) {
    actions.push(...styleBindActions(selection, base));
  }

  return actions;
}

/** One batched schema edit: declare (unless the id already exists) + bind. */
export function applyBind(
  session: Composition,
  hfId: string,
  action: BindAction,
  id: string,
): void {
  session.batch(() => {
    if (!session.getVariableDeclarations().some((d) => d.id === id)) {
      session.declareVariable(action.declaration(id));
    }
    if (action.kind === "style" && action.styleProp) {
      session.setStyle(hfId, { [action.styleProp]: `var(--${id})` });
    } else {
      session.setAttribute(hfId, `data-var-${action.kind}`, id);
    }
  });
}

const ACTION_LABEL: Record<string, MessageKey> = {
  text: "vars.bindText",
  color: "vars.bindColor",
  background: "vars.bindBackground",
  font: "vars.bindFont",
};

/** Localised label of a bind action (the action's own label stays the history text). */
export function bindActionLabel(action: BindAction): string {
  if (action.key === "src")
    return t(action.label === "Image source" ? "vars.bindImage" : "vars.bindMedia");
  const key = ACTION_LABEL[action.key];
  return key ? t(key) : action.label;
}
