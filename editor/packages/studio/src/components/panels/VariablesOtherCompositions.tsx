/**
 * Variables tab section for compositions OTHER than the active one. A variable
 * promoted into a sub-comp lives in that frame's file, not the active session —
 * this surfaces every such file's declarations grouped by path, with per-file
 * management (edit declaration / remove). Live-preview override for these is a
 * follow-up (values are per-composition-scope), so no preview control is shown.
 */

import { useCallback, useState, type MutableRefObject } from "react";
import type { Composition, CompositionVariable } from "@hyperframes/sdk";
import {
  useEditVariablesInFile,
  useProjectCompositionVariables,
  type CompositionVariableGroup,
  type RecordEditFn,
} from "../../hooks/useProjectCompositionVariables";
import {
  DeclarationForm,
  draftFromDeclaration,
  mergeDeclarationEdit,
  variableTypeLabel,
} from "./VariablesDeclarationForm";
import { RemoveDeclarationDialog } from "./VariablesRows";
import { t, useLocale } from "../../i18n/translate";
import { OutputIconButton } from "../output/OutputButton";
import { OutputSection } from "../output/OutputFields";

function CompositionSection({
  group,
  editingKey,
  onToggleEdit,
  onSave,
  onRemove,
}: {
  group: CompositionVariableGroup;
  editingKey: string | null;
  onToggleEdit: (key: string | null) => void;
  onSave: (path: string, decl: CompositionVariable) => void;
  onRemove: (path: string, id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-studio-surface p-2.5 shadow-[inset_0_0_0_1px_var(--st-bd)]">
      <span className="flex min-w-0 flex-col">
        <b className="truncate text-[13px] font-semibold" title={group.path}>
          {group.path}
        </b>
        <span className="text-[11px] text-[var(--st-t2)]">
          {t("vars.declaredCount", { n: group.variables.length })}
        </span>
      </span>
      {group.variables.map((decl) => {
        const key = `${group.path}::${decl.id}`;
        const editing = editingKey === key;
        return (
          <div key={key} title={decl.description} className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-[13px] font-medium">{decl.label}</span>
              <span className="inline-flex h-[22px] flex-none items-center rounded-lg bg-[var(--st-sub)] px-2 text-xs font-semibold text-[var(--st-t2)]">
                {variableTypeLabel(decl.type)}
              </span>
              <span className="flex-1" />
              <OutputIconButton
                icon="pen"
                label={t("vars.edit", { label: decl.label })}
                size={28}
                iconSize={14}
                pressed={editing}
                onClick={() => onToggleEdit(editing ? null : key)}
              />
              <OutputIconButton
                icon="close"
                label={t("vars.remove", { label: decl.label })}
                size={28}
                iconSize={14}
                onClick={() => onRemove(group.path, decl.id)}
              />
            </div>
            {editing && (
              <DeclarationForm
                initial={draftFromDeclaration(decl)}
                submitLabel={t("vars.save")}
                onSubmit={(edited) => onSave(group.path, mergeDeclarationEdit(decl, edited))}
                onCancel={() => onToggleEdit(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function VariablesOtherCompositions({
  fileTree,
  excludePath,
  refreshKey,
  readProjectFile,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  domEditSaveTimestampRef,
}: {
  fileTree: string[];
  excludePath: string;
  refreshKey: unknown;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: RecordEditFn;
  reloadPreview: () => void;
  domEditSaveTimestampRef: MutableRefObject<number>;
}) {
  useLocale();
  const [selfRefresh, setSelfRefresh] = useState(0);
  const [open, setOpen] = useState(true);
  const [removing, setRemoving] = useState<{ path: string; id: string } | null>(null);
  const groups = useProjectCompositionVariables(
    fileTree,
    excludePath,
    readProjectFile,
    `${refreshKey}:${selfRefresh}`,
  );
  const editInFile = useEditVariablesInFile({
    readProjectFile,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    domEditSaveTimestampRef,
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const onSave = useCallback(
    (path: string, decl: CompositionVariable) => {
      setEditingKey(null);
      void editInFile(path, `Update variable "${decl.id}"`, (s: Composition) =>
        s.updateVariableDeclaration(decl.id, decl),
      ).then(() => setSelfRefresh((r) => r + 1));
    },
    [editInFile],
  );
  const onRemove = useCallback(
    (path: string, id: string) => {
      void editInFile(path, `Remove variable "${id}"`, (s: Composition) =>
        s.removeVariableDeclaration(id),
      ).then(() => setSelfRefresh((r) => r + 1));
    },
    [editInFile],
  );

  if (groups.length === 0) return null;

  return (
    <OutputSection
      title={t("vars.otherCompositions")}
      right={
        <OutputIconButton
          icon={open ? "chevronUp" : "chevronDown"}
          label={open ? t("vars.collapse") : t("vars.expand")}
          onClick={() => setOpen((v) => !v)}
        />
      }
    >
      {open
        ? groups.map((group) => (
            <CompositionSection
              key={group.path}
              group={group}
              editingKey={editingKey}
              onToggleEdit={setEditingKey}
              onSave={onSave}
              onRemove={(path, id) => setRemoving({ path, id })}
            />
          ))
        : null}
      <RemoveDeclarationDialog
        id={removing?.id ?? null}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) onRemove(removing.path, removing.id);
          setRemoving(null);
        }}
      />
    </OutputSection>
  );
}
