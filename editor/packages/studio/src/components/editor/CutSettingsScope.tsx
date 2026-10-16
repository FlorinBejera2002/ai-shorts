import { type ReactNode } from "react";
import { sourceCutHostSelection } from "../../utils/sourceCutIsolation";
import {
  cutMediaRole,
  authoredCutMediaSettings,
  patchCutMediaSettings,
  type CutMediaSetting,
} from "../../utils/sourceCutMediaSettings";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";
import type { DomEditSelection } from "./domEditingTypes";
import { CutSettingsScopeContext, useCutSettingsScope } from "./cutSettingsScopeContext";
import { patchCutPresentation } from "../../utils/sourceCutPresentation";

function ScopedSettings({
  selection,
  originalSelection,
  recordEdit,
  children,
}: SourceCutControlProps & { originalSelection: DomEditSelection; children: ReactNode }) {
  const { busy, error, saveSourceCutChanges } = useSourceCutChanges({ selection, recordEdit });
  const role = cutMediaRole(originalSelection.element);
  return (
    <CutSettingsScopeContext
      value={{
        selection: originalSelection,
        busy,
        error,
        applyPresentationToAll: async () => {
          if (role !== "visual") return;
          await saveSourceCutChanges({
            applyToAll: true,
            label: "All cuts: image styling and static layout",
            patch: (html, _target, selectedSource) => patchCutPresentation(html, selectedSource),
          });
        },
        applyAll: async (settings, label) => {
          if (!role) return;
          await saveSourceCutChanges({
            applyToAll: true,
            label: `All cuts: ${label}`,
            patch: (html, target, selectedSource) =>
              patchCutMediaSettings(
                html,
                target,
                role,
                authoredCutMediaSettings(selectedSource, role, settings),
              ),
          });
        },
      }}
    >
      {children}
    </CutSettingsScopeContext>
  );
}

export function CutSettingsScopeProvider({
  selection,
  recordEdit,
  children,
}: Omit<SourceCutControlProps, "selection"> & {
  selection: DomEditSelection | null;
  children: ReactNode;
}) {
  const hostSelection = selection && sourceCutHostSelection(selection);
  if (!hostSelection || !selection || !cutMediaRole(selection.element)) return children;
  return (
    <ScopedSettings
      key={hostSelection.id}
      selection={hostSelection}
      originalSelection={selection}
      recordEdit={recordEdit}
    >
      {children}
    </ScopedSettings>
  );
}

export function ApplyCutSettingToAll({
  label,
  settings,
}: {
  label: string;
  settings: CutMediaSetting[];
}) {
  const scope = useCutSettingsScope();
  if (!scope) return null;
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={scope.busy}
        aria-label={`Apply ${label.toLowerCase()} to all cuts`}
        className="min-h-8 rounded-md border border-panel-border px-2 text-[11px] text-panel-text-2 hover:bg-panel-hover disabled:opacity-40"
        onClick={() => void scope.applyAll(settings, label).catch(() => {})}
      >
        Apply to all cuts
      </button>
      {scope.error && (
        <p role="alert" className="text-xs text-red-300">
          {scope.error}
        </p>
      )}
    </div>
  );
}
