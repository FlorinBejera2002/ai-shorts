import { readStudioUiPreferences } from "../../utils/studioUiPreferences";

export const SNAP_DEFAULTS = {
  snapEnabled: true,
  gridVisible: false,
  gridSpacing: 50,
  snapToGrid: false,
};

export type SnapPrefs = typeof SNAP_DEFAULTS;

export function readSnapPrefs(): SnapPrefs {
  const prefs = readStudioUiPreferences();
  return {
    snapEnabled: prefs.snapEnabled ?? SNAP_DEFAULTS.snapEnabled,
    gridVisible: prefs.gridVisible ?? SNAP_DEFAULTS.gridVisible,
    gridSpacing: prefs.gridSpacing ?? SNAP_DEFAULTS.gridSpacing,
    snapToGrid: prefs.snapToGrid ?? SNAP_DEFAULTS.snapToGrid,
  };
}
