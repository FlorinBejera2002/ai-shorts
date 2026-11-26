/**
 * Draft <-> declaration conversions for the variable declaration form. Pure
 * helpers only; the form component lives in VariablesDeclarationForm.tsx.
 */

import type { CompositionVariable, CompositionVariableType } from "@hyperframes/sdk";
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

export interface DeclarationDraft {
  id: string;
  label: string;
  type: CompositionVariableType;
  defaultRaw: string;
  description: string;
  min: string;
  max: string;
  step: string;
  optionsRaw: string;
}

export const EMPTY_DRAFT: DeclarationDraft = {
  id: "",
  label: "",
  type: "string",
  defaultRaw: "",
  description: "",
  min: "",
  max: "",
  step: "",
  optionsRaw: "",
};

// Per-type field mapping — one ternary per optional field.
// fallow-ignore-next-line complexity
export function draftFromDeclaration(decl: CompositionVariable): DeclarationDraft {
  const numeric = decl.type === "number" ? decl : null;
  return {
    ...EMPTY_DRAFT,
    id: decl.id,
    label: decl.label,
    type: decl.type,
    defaultRaw: String(decl.default),
    description: decl.description ?? "",
    min: numeric?.min !== undefined ? String(numeric.min) : "",
    max: numeric?.max !== undefined ? String(numeric.max) : "",
    step: numeric?.step !== undefined ? String(numeric.step) : "",
    optionsRaw:
      decl.type === "enum" ? decl.options.map((o) => `${o.value}:${o.label}`).join("\n") : "",
  };
}

function numberDeclFromDraft(
  base: { id: string; label: string; description?: string },
  draft: DeclarationDraft,
): CompositionVariable | string {
  const value = Number(draft.defaultRaw);
  if (!Number.isFinite(value)) return t("vars.errNumber");
  const constraint = (key: "min" | "max" | "step") => {
    const raw = draft[key].trim();
    if (!raw) return {};
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? { [key]: parsed } : {};
  };
  return {
    ...base,
    type: "number",
    default: value,
    ...constraint("min"),
    ...constraint("max"),
    ...constraint("step"),
  };
}

// fallow-ignore-next-line complexity
function enumDeclFromDraft(
  base: { id: string; label: string; description?: string },
  draft: DeclarationDraft,
): CompositionVariable | string {
  const options = draft.optionsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split(":");
      const v = (value ?? "").trim();
      return { value: v, label: rest.join(":").trim() || v };
    })
    .filter((o) => o.value.length > 0);
  if (options.length === 0) return t("vars.errEnumEmpty");
  const value = draft.defaultRaw.trim() || (options[0]?.value ?? "");
  if (!options.some((o) => o.value === value)) return t("vars.errEnumDefault");
  return { ...base, type: "enum", default: value, options };
}

/**
 * Fields the form actually models. On an unchanged-type edit, every OTHER key
 * of the original declaration (font source/default_name/default_source,
 * brandRole, placeholder, maxLength, unit, …) must ride through untouched —
 * updateVariableDeclaration replaces wholesale, so dropping them here would
 * silently strip schema metadata on every Edit + Save.
 */
const FORM_OWNED_KEYS = new Set([
  "id",
  "label",
  "type",
  "default",
  "description",
  "min",
  "max",
  "step",
  "options",
]);

export function mergeDeclarationEdit(
  original: CompositionVariable,
  edited: CompositionVariable,
): CompositionVariable {
  // Type changed → old type-specific metadata no longer applies.
  if (original.type !== edited.type) return edited;
  const passthrough: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(original)) {
    if (!FORM_OWNED_KEYS.has(key)) passthrough[key] = value;
  }
  // Both sides are same-type declarations and edited owns every form key, so
  // the merge preserves the declared shape.
  return { ...passthrough, ...edited };
}

/** Build a typed declaration from the form draft; string on validation error. */
// fallow-ignore-next-line complexity
export function declarationFromDraft(draft: DeclarationDraft): CompositionVariable | string {
  const id = draft.id.trim();
  if (!id) return t("vars.errIdRequired");
  const label = draft.label.trim() || id;
  const description = draft.description.trim() || undefined;
  const base = { id, label, ...(description ? { description } : {}) };
  switch (draft.type) {
    case "number":
      return numberDeclFromDraft(base, draft);
    case "boolean":
      return { ...base, type: "boolean", default: draft.defaultRaw.trim() === "true" };
    case "enum":
      return enumDeclFromDraft(base, draft);
    default:
      // string / color / font / image — string default, verbatim.
      return { ...base, type: draft.type, default: draft.defaultRaw };
  }
}

const TYPE_LABEL: Record<CompositionVariableType, MessageKey> = {
  string: "vars.typeString",
  number: "vars.typeNumber",
  color: "vars.typeColor",
  boolean: "vars.typeBoolean",
  enum: "vars.typeEnum",
  font: "vars.typeFont",
  image: "vars.typeImage",
};

/** Localised name of a variable type ("Text", "Număr", "Listă"…). */
export function variableTypeLabel(type: CompositionVariableType): string {
  return t(TYPE_LABEL[type]);
}
