// Lets the toolbar (built by App) open the shortcuts sheet that TimelinePane owns, since only
// the pane has the seek it needs for "Salt la cadru".
import { createContext, useContext } from "react";

export interface TimelineShortcutsControl {
  open: boolean;
  toggle: () => void;
}

export const TimelineShortcutsContext = createContext<TimelineShortcutsControl | null>(null);

export function useTimelineShortcutsControl(): TimelineShortcutsControl | null {
  return useContext(TimelineShortcutsContext);
}
