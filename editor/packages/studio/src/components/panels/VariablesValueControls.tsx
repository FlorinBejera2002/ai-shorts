/**
 * Per-type preview-value inputs for the Variables panel. Text-like inputs
 * draft locally and commit on blur/Enter so the preview doesn't reload per
 * keystroke; discrete inputs (checkbox, select, color swatch, range) commit
 * immediately.
 */

import { useState } from "react";
import { t, useLocale } from "../../i18n/translate";
import { OutputSelect } from "../output/OutputFields";
import type {
  CompositionVariable,
  ColorVariable,
  EnumVariable,
  NumberVariable,
} from "@hyperframes/sdk";

/** Board text field: 40px, 14px radius, inset border, token colours. */
const FIELD_BASE =
  "h-10 min-w-0 rounded-[14px] border-0 bg-studio-surface px-3 text-[13px] text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)]";
export const VARIABLES_INPUT_CLASS = `${FIELD_BASE} w-full`;

/** Text input that drafts locally and commits on blur/Enter. */
function DraftTextInput({
  value,
  onCommit,
  type = "text",
  className = VARIABLES_INPUT_CLASS,
  maxLength,
  placeholder,
  min,
  max,
  step,
}: {
  value: string;
  onCommit: (raw: string) => void;
  type?: "text" | "number";
  className?: string;
  maxLength?: number;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type={type}
      value={draft ?? value}
      maxLength={maxLength}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== value) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={className}
    />
  );
}

function EnumControl({
  decl,
  current,
  onCommit,
}: {
  decl: EnumVariable;
  current: unknown;
  onCommit: (value: unknown) => void;
}) {
  return (
    <OutputSelect value={String(current)} onChange={(e) => onCommit(e.target.value)}>
      {decl.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </OutputSelect>
  );
}

function ColorControl({
  current,
  onCommit,
}: {
  decl: ColorVariable;
  current: unknown;
  onCommit: (value: unknown) => void;
}) {
  const colorValue = typeof current === "string" ? current : "#000000";
  // The native picker fires change continuously while dragging the gradient;
  // draft locally and commit once on close (blur) — each commit reloads the
  // whole preview iframe.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={draft ?? (/^#[0-9a-fA-F]{6}$/.test(colorValue) ? colorValue : "#000000")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== colorValue) onCommit(draft);
          setDraft(null);
        }}
        aria-label={t("vars.typeColor")}
        className="h-10 w-10 flex-none cursor-pointer rounded-[14px] border-0 bg-transparent p-1 shadow-[inset_0_0_0_1px_var(--st-sbd)]"
      />
      <DraftTextInput
        value={colorValue}
        onCommit={onCommit}
        className={`${FIELD_BASE} flex-1 font-mono`}
      />
    </div>
  );
}

// fallow-ignore-next-line complexity
function NumberControl({
  decl,
  current,
  onCommit,
}: {
  decl: NumberVariable;
  current: unknown;
  onCommit: (value: unknown) => void;
}) {
  const numberValue = typeof current === "number" ? current : Number(current) || 0;
  const hasRange = decl.min !== undefined && decl.max !== undefined;
  // Drag ticks stay local; commit once on release — each commit reloads the
  // whole preview iframe, so per-tick commits would thrash it.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const commitDrag = () => {
    if (dragValue !== null && dragValue !== numberValue) onCommit(dragValue);
    setDragValue(null);
  };
  const commitRaw = (raw: string) => {
    const n = Number(raw);
    onCommit(Number.isFinite(n) ? n : raw);
  };
  return (
    <div className="flex items-center gap-2">
      {hasRange && (
        <input
          type="range"
          min={decl.min}
          max={decl.max}
          step={decl.step ?? 1}
          value={dragValue ?? numberValue}
          onChange={(e) => setDragValue(Number(e.target.value))}
          onPointerUp={commitDrag}
          onKeyUp={commitDrag}
          onBlur={commitDrag}
          className="min-w-0 flex-1 accent-[var(--st-btn)]"
        />
      )}
      <DraftTextInput
        type="number"
        value={String(numberValue)}
        onCommit={commitRaw}
        min={decl.min}
        max={decl.max}
        step={decl.step}
        className={`${FIELD_BASE} ${hasRange ? "w-16" : "flex-1"} tabular-nums`}
      />
      {decl.unit && <span className="text-xs text-[var(--st-t2)]">{decl.unit}</span>}
    </div>
  );
}

/** True/false row (St-Output-Variables "Arată logo"): the value as a word and a switch. */
function BooleanControl({
  label,
  checked,
  onCommit,
}: {
  label: string;
  checked: boolean;
  onCommit: (value: unknown) => void;
}) {
  useLocale();
  return (
    <div className="flex min-h-10 items-center justify-between rounded-[14px] bg-studio-surface px-3 shadow-[inset_0_0_0_1px_var(--st-sbd)]">
      <span className="text-[13px] font-medium">{checked ? t("vars.true") : t("vars.false")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCommit(!checked)}
        className={`relative h-6 w-10 flex-none rounded-full outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${checked ? "bg-[var(--st-btn)]" : "bg-[var(--st-hd)]"}`}
      >
        <span
          className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-[left] ${checked ? "left-[19px] bg-[var(--st-on-btn)]" : "left-[3px] bg-studio-surface"}`}
        />
      </button>
    </div>
  );
}

// Per-type dispatcher — one branch per variable type, same shape as BlockParamsPanel.
// fallow-ignore-next-line complexity
export function PreviewValueControl({
  decl,
  value,
  onCommit,
}: {
  decl: CompositionVariable;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const current = value === undefined ? decl.default : value;

  switch (decl.type) {
    case "boolean":
      return <BooleanControl label={decl.label} checked={current === true} onCommit={onCommit} />;
    case "enum":
      return <EnumControl decl={decl} current={current} onCommit={onCommit} />;
    case "color":
      return <ColorControl decl={decl} current={current} onCommit={onCommit} />;
    case "number":
      return <NumberControl decl={decl} current={current} onCommit={onCommit} />;
    default: {
      // string / font (family name) / image (URL) — plain text input for v1.
      const textValue = typeof current === "string" ? current : JSON.stringify(current);
      return (
        <DraftTextInput
          value={textValue}
          onCommit={onCommit}
          maxLength={decl.type === "string" ? decl.maxLength : undefined}
          placeholder={decl.type === "string" ? decl.placeholder : undefined}
        />
      );
    }
  }
}
