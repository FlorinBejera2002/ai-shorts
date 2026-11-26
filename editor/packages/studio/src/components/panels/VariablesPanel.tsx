import { memo, useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { Composition, CompositionVariable } from "@hyperframes/sdk";
import type { EditHistoryKind } from "../../utils/editHistory";
import type { PublishSdkSession } from "../../utils/sdkCutover";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { useDomEditContext } from "../../contexts/DomEditContext";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { VariablesBindElement, type BindAction, applyBind } from "./VariablesBindElement";
import { useVariablesPersist } from "../../hooks/useVariablesPersist";
import { VariablesOtherCompositions } from "./VariablesOtherCompositions";
import {
  HandoffFooter,
  PreviewModeHeader,
  RemoveDeclarationDialog,
  UndeclaredReads,
  ValidationStrip,
  VariableRow,
} from "./VariablesRows";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton } from "../output/OutputButton";
import { OutputIcon } from "../output/OutputIcon";
import { usePreviewVariablesStore } from "../../hooks/previewVariablesStore";
import { DeclarationForm, EMPTY_DRAFT } from "./VariablesDeclarationForm";
import { copyTextToClipboard } from "../../utils/clipboard";
import { resolveMasterCompositionPath } from "../../utils/studioUrlState";

export interface StudioEditPersistenceProps {
  sdkSession: Composition | null;
  publishSdkSession: PublishSdkSession;
  reloadPreview: () => void;
  domEditSaveTimestampRef: MutableRefObject<number>;
  recordEdit: (entry: {
    label: string;
    kind: EditHistoryKind;
    files: Record<string, { before: string; after: string }>;
  }) => Promise<void>;
}

type VariablesPanelProps = StudioEditPersistenceProps;

// Panel orchestrator — JSX conditionals per section, same shape as StudioRightPanel.
// fallow-ignore-next-line complexity
export const VariablesPanel = memo(function VariablesPanel({
  sdkSession,
  publishSdkSession,
  reloadPreview,
  domEditSaveTimestampRef,
  recordEdit,
}: VariablesPanelProps) {
  useLocale();
  const { activeCompPath, showToast } = useStudioShellContext();
  const { refreshKey } = useStudioPlaybackContext();
  const { readProjectFile, writeProjectFile, fileTree } = useFileManagerContext();
  const { domEditSelection } = useDomEditContext();
  // On the master view (no activeCompPath) the panel targets the project's real
  // main composition — the first .html in the tree — not a hardcoded index.html
  // that may not exist. This same path is used for the persist write target (so
  // an edit never lands in a phantom index.html) AND the handoff render command.
  // Null only when the project has no composition yet, in which case sdkSession
  // is also null and the panel is inert.
  const effectiveCompPath = activeCompPath ?? resolveMasterCompositionPath(fileTree);
  const previewValues = usePreviewVariablesStore((s) => s.values);
  const setPreviewValues = usePreviewVariablesStore((s) => s.setValues);

  // Bumped after each persisted schema edit so declarations re-derive without
  // waiting for the session reload round-trip.
  const [revision, setRevision] = useState(0);
  // Also bump on any session mutation (undo/redo, edits dispatched by other
  // panels or agents) — the memos below must never trust refreshKey alone.
  useEffect(() => {
    if (!sdkSession) return;
    return sdkSession.on("change", () => setRevision((r) => r + 1));
  }, [sdkSession]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const persistVariables = useVariablesPersist({
    sdkSession,
    activeCompPath: effectiveCompPath,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    domEditSaveTimestampRef,
    publishSdkSession,
  });

  const declarations = useMemo(
    () => sdkSession?.getVariableDeclarations() ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, refreshKey, revision],
  );
  const usage = useMemo(
    () => sdkSession?.getVariableUsage() ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, refreshKey, revision],
  );
  const issues = useMemo(
    () => (previewValues && sdkSession ? sdkSession.validateVariableValues(previewValues) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, previewValues, refreshKey, revision],
  );
  const effectiveValues = useMemo(
    () => sdkSession?.getVariableValues(previewValues ?? undefined) ?? {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, previewValues, refreshKey, revision],
  );

  const copyToClipboard = useCallback(
    (text: string, kind: "json" | "command") => {
      // Shared helper carries the execCommand fallback Safari needs.
      void copyTextToClipboard(text).then((ok) => {
        if (!ok) showToast(t("vars.copyFailed"), "error");
        else showToast(t(kind === "json" ? "vars.copiedJson" : "vars.copiedCommand"), "info");
      });
    },
    [showToast],
  );

  const dropPreviewOverride = useCallback(
    (id: string) => {
      if (previewValues && id in previewValues) {
        const next = { ...previewValues };
        delete next[id];
        setPreviewValues(next);
      }
    },
    [previewValues, setPreviewValues],
  );

  const commitPreviewValue = useCallback(
    (id: string, value: unknown, declDefault: unknown) => {
      const next = { ...(previewValues ?? {}) };
      if (JSON.stringify(value) === JSON.stringify(declDefault)) {
        delete next[id];
      } else {
        next[id] = value;
      }
      setPreviewValues(next);
      reloadPreview();
    },
    [previewValues, setPreviewValues, reloadPreview],
  );

  const runSchemaEdit = useCallback(
    async (label: string, mutate: (session: Composition) => void): Promise<boolean> => {
      try {
        const changed = await persistVariables(label, mutate);
        if (changed) setRevision((r) => r + 1);
        else showToast(t("vars.noChange", { label }), "info");
        return changed;
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
        return false;
      }
    },
    [persistVariables, showToast],
  );

  const handleAdd = useCallback(
    (decl: CompositionVariable) => {
      if (!sdkSession) return;
      const check = sdkSession.can({ type: "declareVariable", declaration: decl });
      if (!check.ok) {
        showToast(check.message, "error");
        return;
      }
      setAddOpen(false);
      void runSchemaEdit(`Declare variable "${decl.id}"`, (s) => s.declareVariable(decl));
    },
    [sdkSession, runSchemaEdit, showToast],
  );

  const handleUpdate = useCallback(
    (decl: CompositionVariable) => {
      if (!sdkSession) return;
      const check = sdkSession.can({
        type: "updateVariableDeclaration",
        id: decl.id,
        declaration: decl,
      });
      if (!check.ok) {
        showToast(check.message, "error");
        return;
      }
      setEditingId(null);
      void runSchemaEdit(`Edit variable "${decl.id}"`, (s) =>
        s.updateVariableDeclaration(decl.id, decl),
      );
    },
    [sdkSession, runSchemaEdit, showToast],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (!sdkSession) return;
      const check = sdkSession.can({ type: "removeVariableDeclaration", id });
      if (!check.ok) {
        showToast(check.message, "error");
        return;
      }
      // Drop the preview override only if the declaration was actually removed —
      // otherwise a rejected/failed edit would leave the row on disk but silently
      // wipe the user's custom preview value.
      void runSchemaEdit(`Remove variable "${id}"`, (s) => s.removeVariableDeclaration(id)).then(
        (changed) => {
          if (changed) dropPreviewOverride(id);
        },
      );
    },
    [sdkSession, runSchemaEdit, dropPreviewOverride, showToast],
  );

  const handleSetDefault = useCallback(
    (id: string, value: string | number | boolean) => {
      void runSchemaEdit(`Set default for "${id}"`, (s) => s.setVariableValue(id, value));
      // The override now equals the persisted default — drop it from preview state.
      dropPreviewOverride(id);
    },
    [runSchemaEdit, dropPreviewOverride],
  );

  const resetPreview = useCallback(() => {
    setPreviewValues(null);
    reloadPreview();
  }, [setPreviewValues, reloadPreview]);

  const handleBind = useCallback(
    // Guard chain (session, selection, type-compat) — one branch per guard.
    // fallow-ignore-next-line complexity
    (action: BindAction, id: string) => {
      if (!sdkSession || !domEditSelection?.hfId) return;
      // Binding to an existing variable is allowed, but only when the types
      // agree — wiring a color style to a string variable silently breaks
      // the element's styling.
      const existing = sdkSession.getVariableDeclarations().find((d) => d.id === id);
      const wanted = action.declaration(id).type;
      if (existing && existing.type !== wanted) {
        showToast(t("vars.bindTypeClash", { id, existing: existing.type }), "error");
        return;
      }
      const hfId = domEditSelection.hfId;
      void runSchemaEdit(`Bind ${action.label.toLowerCase()} to "${id}"`, (s) =>
        applyBind(s, hfId, action, id),
      );
    },
    [sdkSession, domEditSelection, runSchemaEdit, showToast],
  );

  // The bind gesture targets the composition the session models — a selection
  // from another source file must not write bindings into this one.
  const bindableSelection =
    domEditSelection?.hfId && domEditSelection.sourceFile === (activeCompPath ?? "index.html")
      ? domEditSelection
      : null;

  if (!sdkSession) {
    // St-Output-VariablesNoComposition
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--st-sub)] text-[var(--st-t2)]">
          <OutputIcon name="film" size={22} />
        </span>
        <b className="text-sm font-semibold">{t("vars.noComposition")}</b>
      </div>
    );
  }

  if (addOpen) {
    // St-Output-VariablesDeclare: the form replaces the list until it is saved or cancelled.
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4">
        <h3 className="font-display text-[17px] font-semibold leading-6">{t("vars.add")}</h3>
        <DeclarationForm
          initial={EMPTY_DRAFT}
          submitLabel={t("vars.declare")}
          onSubmit={handleAdd}
          onCancel={() => setAddOpen(false)}
          variant="panel"
        />
      </div>
    );
  }

  return (
    <div
      data-studio-variables
      className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-4 pt-1 pb-4"
    >
      <PreviewModeHeader
        overrideCount={previewValues ? Object.keys(previewValues).length : 0}
        onReset={resetPreview}
      />
      {bindableSelection && (
        <VariablesBindElement
          key={bindableSelection.hfId}
          selection={bindableSelection}
          sdkSession={sdkSession}
          onBind={handleBind}
        />
      )}
      <ValidationStrip issues={issues} />
      {declarations.length === 0 ? (
        // St-Output-VariablesEmpty
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-6">
          <b className="text-sm font-semibold">{t("vars.empty")}</b>
          <OutputButton variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
            {t("vars.add")}
          </OutputButton>
        </div>
      ) : null}
      {/* fallow-ignore-next-line complexity */}
      {declarations.map((decl) => (
        <VariableRow
          key={decl.id}
          decl={decl}
          value={previewValues && decl.id in previewValues ? previewValues[decl.id] : decl.default}
          overridden={previewValues !== null && decl.id in previewValues}
          unused={
            usage !== null && !usage.scanIncomplete && usage.unusedDeclarations.includes(decl.id)
          }
          editing={editingId === decl.id}
          onCommitPreview={(v) => commitPreviewValue(decl.id, v, decl.default)}
          onSetDefault={(v) => handleSetDefault(decl.id, v)}
          onToggleEdit={() => setEditingId(editingId === decl.id ? null : decl.id)}
          onSaveEdit={handleUpdate}
          onRemove={() => setRemovingId(decl.id)}
        />
      ))}
      <UndeclaredReads
        usage={usage}
        onDeclare={(id) => handleAdd({ id, type: "string", label: id, default: "" })}
      />
      {usage?.scanIncomplete && (
        <p className="text-xs text-[var(--st-t2)]">{t("vars.scanIncomplete")}</p>
      )}
      {declarations.length > 0 && (
        <>
          <OutputButton icon="plus" className="w-full" onClick={() => setAddOpen(true)}>
            {t("vars.add")}
          </OutputButton>
          <HandoffFooter
            effectiveValues={effectiveValues}
            compPath={effectiveCompPath ?? "index.html"}
            onCopy={copyToClipboard}
          />
        </>
      )}
      <VariablesOtherCompositions
        fileTree={fileTree}
        excludePath={activeCompPath ?? "index.html"}
        refreshKey={`${refreshKey}:${revision}`}
        readProjectFile={readProjectFile}
        writeProjectFile={writeProjectFile}
        recordEdit={recordEdit}
        reloadPreview={reloadPreview}
        domEditSaveTimestampRef={domEditSaveTimestampRef}
      />
      <RemoveDeclarationDialog
        id={removingId}
        onCancel={() => setRemovingId(null)}
        onConfirm={() => {
          if (removingId) handleRemove(removingId);
          setRemovingId(null);
        }}
      />
    </div>
  );
});
