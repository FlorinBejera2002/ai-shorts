import { useContext } from "react";
import { createStableContext } from "../../utils/hmrStableContext";
import type { CutMediaSetting } from "../../utils/sourceCutMediaSettings";
import type { DomEditSelection } from "./domEditingTypes";

interface CutSettingsScopeValue {
  selection: DomEditSelection;
  busy: boolean;
  error: string | null;
  applyAll: (settings: CutMediaSetting[], label: string) => Promise<void>;
  applyPresentationToAll: () => Promise<void>;
}
export const CutSettingsScopeContext = createStableContext<CutSettingsScopeValue | null>(
  "editor/CutSettingsScope",
  null,
);
export function useCutSettingsScope() {
  return useContext(CutSettingsScopeContext);
}
