// Pieces of the Variables tab (St-Output-Variables*): the preview-state header, one row per
// declared variable, undeclared reads, the copy actions, validation issues and the remove
// confirmation with the delete illustration.
import type {
  CompositionVariable,
  VariableUsageReport,
  VariableValidationIssue,
} from "@hyperframes/sdk";
import { isScalarVariableValue as isScalar } from "@hyperframes/core/variables";
import { t } from "../../i18n/translate";
import { OutputButton, OutputIconButton } from "../output/OutputButton";
import { OutputDialog, OutputIllustration } from "../output/OutputDialog";
import { OutputNotice, OutputSection } from "../output/OutputFields";
import { illustrationSrc } from "../ui/illustrations";
import {
  DeclarationForm,
  draftFromDeclaration,
  mergeDeclarationEdit,
} from "./VariablesDeclarationForm";
import { PreviewValueControl } from "./VariablesValueControls";
import { renderCommand } from "./variablesRenderCommand";

export { renderCommand } from "./variablesRenderCommand";

function formatIssue(issue: VariableValidationIssue): string {
  switch (issue.kind) {
    case "undeclared":
      return t("vars.issueUndeclared", { id: issue.variableId });
    case "type-mismatch":
      return t("vars.issueType", {
        id: issue.variableId,
        expected: issue.expected,
        actual: issue.actual,
      });
    case "enum-out-of-range":
      return t("vars.issueEnum", { id: issue.variableId, allowed: issue.allowed.join(", ") });
  }
}

export function ValidationStrip({ issues }: { issues: VariableValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <OutputNotice>
      {issues.map((issue) => (
        <span key={`${issue.kind}:${issue.variableId}`} className="block">
          {formatIssue(issue)}
        </span>
      ))}
    </OutputNotice>
  );
}

/** "Valori implicite" (or the custom count) and Resetează. */
export function PreviewModeHeader({
  overrideCount,
  onReset,
}: {
  overrideCount: number;
  onReset: () => void;
}) {
  const hasOverrides = overrideCount > 0;
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span className="inline-flex h-[26px] items-center rounded-lg bg-[var(--st-sub)] px-2 text-xs font-semibold text-studio-text">
        {hasOverrides ? t("vars.customCount", { n: overrideCount }) : t("vars.defaults")}
      </span>
      <span className="flex-1" />
      <OutputButton
        variant="ghost"
        height={32}
        padX={10}
        fontSize={12}
        disabled={!hasOverrides}
        onClick={onReset}
      >
        {t("vars.reset")}
      </OutputButton>
    </div>
  );
}

// fallow-ignore-next-line complexity
export function VariableRow({
  decl,
  value,
  overridden,
  unused,
  editing,
  onCommitPreview,
  onSetDefault,
  onToggleEdit,
  onSaveEdit,
  onRemove,
}: {
  decl: CompositionVariable;
  value: unknown;
  overridden: boolean;
  unused: boolean;
  editing: boolean;
  onCommitPreview: (value: unknown) => void;
  onSetDefault: (value: string | number | boolean) => void;
  onToggleEdit: () => void;
  onSaveEdit: (decl: CompositionVariable) => void;
  onRemove: () => void;
}) {
  return (
    <section
      data-variable-id={decl.id}
      title={decl.description}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <b className="whitespace-nowrap text-[13px] font-semibold">{decl.label}</b>
        <span className="min-w-0 truncate font-mono text-[11px] text-[var(--st-t3)]">
          {decl.id}
        </span>
        {unused ? (
          <span
            title={t("vars.unusedTitle")}
            className="inline-flex h-[22px] flex-none items-center rounded-lg bg-[var(--st-sub)] px-2 text-xs font-semibold text-[var(--st-t2)]"
          >
            {t("vars.unused")}
          </span>
        ) : null}
        <span className="flex-1" />
        {overridden && isScalar(value) ? (
          <OutputButton
            variant="ghost"
            height={28}
            padX={8}
            fontSize={11}
            title={t("vars.setDefaultTitle")}
            onClick={() => onSetDefault(value)}
          >
            {t("vars.setDefault")}
          </OutputButton>
        ) : null}
        <OutputIconButton
          icon="pen"
          label={t("vars.edit", { label: decl.label })}
          size={28}
          iconSize={14}
          pressed={editing}
          onClick={onToggleEdit}
        />
        <OutputIconButton
          icon="close"
          label={t("vars.remove", { label: decl.label })}
          size={28}
          iconSize={14}
          onClick={onRemove}
        />
      </div>
      {editing ? (
        <DeclarationForm
          initial={draftFromDeclaration(decl)}
          submitLabel={t("vars.save")}
          onSubmit={(edited) => onSaveEdit(mergeDeclarationEdit(decl, edited))}
          onCancel={onToggleEdit}
        />
      ) : (
        <PreviewValueControl decl={decl} value={value} onCommit={onCommitPreview} />
      )}
    </section>
  );
}

export function UndeclaredReads({
  usage,
  onDeclare,
}: {
  usage: VariableUsageReport | null;
  onDeclare: (id: string) => void;
}) {
  if (!usage || usage.undeclaredReads.length === 0) return null;
  return (
    <OutputSection title={t("vars.undeclaredTitle")}>
      {usage.undeclaredReads.map((id) => (
        <div
          key={id}
          className="flex items-center justify-between gap-2 rounded-[14px] bg-studio-surface py-2.5 pr-2.5 pl-3 shadow-[inset_0_0_0_1px_var(--st-bd)]"
        >
          <span className="min-w-0 truncate text-[13px] font-medium">
            {t("vars.undeclaredRow", { id })}
          </span>
          <OutputButton height={30} padX={12} fontSize={12} onClick={() => onDeclare(id)}>
            {t("vars.declare")}
          </OutputButton>
        </div>
      ))}
    </OutputSection>
  );
}

/** "Valori": copy the effective values as JSON or as a render command. */
export function HandoffFooter({
  effectiveValues,
  compPath,
  onCopy,
}: {
  effectiveValues: Record<string, unknown>;
  compPath: string;
  onCopy: (text: string, kind: "json" | "command") => void;
}) {
  const command = renderCommand(compPath, effectiveValues);
  return (
    <OutputSection title={t("vars.values")}>
      <OutputButton
        height={36}
        icon="copy"
        iconSize={14}
        padX={14}
        className="w-full"
        style={{ justifyContent: "flex-start" }}
        onClick={() => onCopy(JSON.stringify(effectiveValues), "json")}
      >
        {t("vars.copyJson")}
      </OutputButton>
      <OutputButton
        height={36}
        icon="copy"
        iconSize={14}
        title={command}
        padX={14}
        className="w-full"
        style={{ justifyContent: "flex-start" }}
        onClick={() => onCopy(command, "command")}
      >
        {t("vars.copyCommand")}
      </OutputButton>
    </OutputSection>
  );
}

/** "Elimini declarația?" (St-Output-VariablesRemove) with the delete illustration. */
export function RemoveDeclarationDialog({
  id,
  onCancel,
  onConfirm,
}: {
  id: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <OutputDialog
      open={id !== null}
      title={t("vars.removeTitle")}
      onClose={onCancel}
      width={420}
      footer={
        <>
          <OutputButton onClick={onCancel}>{t("vars.cancel")}</OutputButton>
          <OutputButton variant="dangerFill" onClick={onConfirm}>
            {t("vars.removeConfirm")}
          </OutputButton>
        </>
      }
    >
      <OutputIllustration src={illustrationSrc("delete")} size={160} caption={id ?? ""} />
    </OutputDialog>
  );
}
