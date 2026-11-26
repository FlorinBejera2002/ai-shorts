/**
 * Add/edit form for a variable declaration. Builds a typed
 * CompositionVariable from free-text drafts; structural validation beyond
 * the field-level checks here is the SDK's job (can() on dispatch).
 */

import { useId, useState } from "react";
import type { CompositionVariable, CompositionVariableType } from "@hyperframes/sdk";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { OutputButton } from "../output/OutputButton";
import { OutputInput, OutputSelect } from "../output/OutputFields";
import {
  type DeclarationDraft,
  declarationFromDraft,
  variableTypeLabel,
} from "./variablesDeclarationDraft";

export {
  EMPTY_DRAFT,
  declarationFromDraft,
  draftFromDeclaration,
  mergeDeclarationEdit,
  variableTypeLabel,
  type DeclarationDraft,
} from "./variablesDeclarationDraft";

const VARIABLE_TYPES: CompositionVariableType[] = [
  "string",
  "number",
  "color",
  "boolean",
  "enum",
  "font",
  "image",
];

const BOUND_LABEL: Record<"min" | "max" | "step", MessageKey> = {
  min: "vars.formMin",
  max: "vars.formMax",
  step: "vars.formStep",
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-[var(--st-t2)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function DefaultField({
  id,
  draft,
  height,
  invalid,
  onChange,
}: {
  id: string;
  draft: DeclarationDraft;
  height: number;
  invalid: boolean;
  onChange: (defaultRaw: string) => void;
}) {
  if (draft.type === "boolean") {
    return (
      <OutputSelect
        id={id}
        height={height}
        value={draft.defaultRaw === "true" ? "true" : "false"}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="false">{t("vars.false")}</option>
        <option value="true">{t("vars.true")}</option>
      </OutputSelect>
    );
  }
  return (
    <OutputInput
      id={id}
      height={height}
      invalid={invalid}
      type="text"
      value={draft.defaultRaw}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Which field an error message belongs to, so that field gets the danger outline. */
function errorField(error: string | null): "id" | "default" | "options" | null {
  if (!error) return null;
  if (error === t("vars.errIdRequired")) return "id";
  if (error === t("vars.errEnumEmpty")) return "options";
  return "default";
}

function OptionsField({
  id,
  label,
  value,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      aria-invalid={invalid || undefined}
      className={`block h-[84px] w-full resize-y rounded-[14px] border-0 bg-studio-surface px-3 py-2.5 font-mono text-[13px] leading-[18px] text-studio-text outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)] ${
        invalid
          ? "shadow-[inset_0_0_0_1.5px_var(--st-danger)]"
          : "shadow-[inset_0_0_0_1px_var(--st-sbd)]"
      }`}
    />
  );
}

/**
 * Add/edit form (St-Output-VariablesDeclare). `variant="panel"` is the full inspector form
 * with 40px fields and the Anulează / Declară footer; `inline` is the compact edit box under
 * a variable row (St-Output-VariablesEnum).
 */
// fallow-ignore-next-line complexity
export function DeclarationForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  variant = "inline",
}: {
  initial: DeclarationDraft;
  submitLabel: string;
  onSubmit: (decl: CompositionVariable) => void;
  onCancel: () => void;
  variant?: "panel" | "inline";
}) {
  useLocale();
  const uid = useId();
  const [draft, setDraft] = useState<DeclarationDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const editingExisting = initial.id.length > 0;
  const set = (patch: Partial<DeclarationDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const h = variant === "panel" ? 40 : 36;
  const bad = errorField(error);

  const submit = () => {
    const result = declarationFromDraft(draft);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setError(null);
    onSubmit(result);
  };

  const fields = (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("vars.formId")} htmlFor={`${uid}-id`}>
          <OutputInput
            id={`${uid}-id`}
            height={h}
            invalid={bad === "id"}
            type="text"
            value={draft.id}
            disabled={editingExisting}
            onChange={(e) => set({ id: e.target.value })}
            className="font-mono disabled:opacity-50"
          />
        </Field>
        <Field label={t("vars.formLabel")} htmlFor={`${uid}-label`}>
          <OutputInput
            id={`${uid}-label`}
            height={h}
            type="text"
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
          />
        </Field>
        <Field label={t("vars.formType")} htmlFor={`${uid}-type`}>
          <OutputSelect
            id={`${uid}-type`}
            height={h}
            value={draft.type}
            onChange={(e) => {
              const type = VARIABLE_TYPES.find((v) => v === e.target.value);
              if (type) set({ type });
            }}
          >
            {VARIABLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {variableTypeLabel(v)}
              </option>
            ))}
          </OutputSelect>
        </Field>
        <Field label={t("vars.formDefault")} htmlFor={`${uid}-default`}>
          <DefaultField
            id={`${uid}-default`}
            draft={draft}
            height={h}
            invalid={bad === "default"}
            onChange={(defaultRaw) => set({ defaultRaw })}
          />
        </Field>
      </div>
      {draft.type === "number" && (
        <div className="grid grid-cols-3 gap-3">
          {(["min", "max", "step"] as const).map((key) => (
            <Field key={key} label={t(BOUND_LABEL[key])} htmlFor={`${uid}-${key}`}>
              <OutputInput
                id={`${uid}-${key}`}
                height={h}
                type="text"
                value={draft[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                className="tabular-nums"
              />
            </Field>
          ))}
        </div>
      )}
      {draft.type === "enum" && (
        <Field label={t("vars.formOptions")} htmlFor={`${uid}-options`}>
          <OptionsField
            id={`${uid}-options`}
            label={t("vars.formOptions")}
            value={draft.optionsRaw}
            invalid={bad === "options"}
            onChange={(optionsRaw) => set({ optionsRaw })}
          />
        </Field>
      )}
      <Field label={t("vars.formDescription")} htmlFor={`${uid}-description`}>
        <OutputInput
          id={`${uid}-description`}
          height={h}
          type="text"
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>
      {error && (
        <span role="alert" className="text-xs font-semibold text-[var(--st-danger)]">
          {error}
        </span>
      )}
    </div>
  );

  if (variant === "panel") {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        {fields}
        <div className="flex gap-2">
          <OutputButton variant="ghost" stretch onClick={onCancel}>
            {t("vars.cancel")}
          </OutputButton>
          <OutputButton variant="primary" stretch onClick={submit}>
            {submitLabel}
          </OutputButton>
        </div>
      </div>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-[14px] bg-studio-surface p-3 shadow-[inset_0_0_0_1px_var(--st-sbd)]">
      {fields}
      <div className="flex justify-end gap-2">
        <OutputButton variant="ghost" height={32} padX={12} fontSize={12} onClick={onCancel}>
          {t("vars.cancel")}
        </OutputButton>
        <OutputButton variant="primary" height={32} padX={12} fontSize={12} onClick={submit}>
          {submitLabel}
        </OutputButton>
      </div>
    </section>
  );
}
