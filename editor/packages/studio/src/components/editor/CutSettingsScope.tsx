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
import { t, useLocale } from "../../i18n/translate";
import { ApplyAllIconButton } from "./CutApplyAllIcon";

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

/**
 * The layers icon of one setting row (St-Inspector-CutApply). `label` is the stable English
 * name used in the undo label; `displayLabel` is what the reader sees.
 */
export function ApplyCutSettingToAll({
  label,
  displayLabel,
  settings,
}: {
  label: string;
  displayLabel?: string;
  settings: CutMediaSetting[];
}) {
  useLocale();
  const scope = useCutSettingsScope();
  if (!scope) return null;
  return (
    <ApplyAllIconButton
      alwaysVisible
      label={t("cut.applyNamedAll", { name: (displayLabel ?? label).toLowerCase() })}
      disabled={scope.busy}
      onClick={() => void scope.applyAll(settings, label).catch(() => {})}
    />
  );
}
