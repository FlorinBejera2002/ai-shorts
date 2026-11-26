// Rail and phone tool bar entries, and how each one maps onto the existing side panel tabs.
import type { MessageKey } from "../../i18n/dictionary";
import { safeLocalStorage } from "../../utils/safeStorage";
import type { SidebarTab } from "../sidebar/LeftSidebar";
import type { ShellIconName } from "./ShellIcon";

export type RailItemId =
  | "media"
  | "text"
  | "subtitles"
  | "audio"
  | "elements"
  | "layers"
  | "advanced";

export interface RailItem {
  id: RailItemId;
  icon: ShellIconName;
  label: MessageKey;
  /** Side panel tab the item shows. */
  tab: SidebarTab;
  /** Also opens the subtitle editor in the inspector. */
  captions?: boolean;
  /** Also opens the inspector's Layers pane. */
  layers?: boolean;
}

// Text and Subtitrări open the block catalog narrowed to text and caption blocks, Elemente the
// whole catalog, Audio the project audio, Straturi the track list; Advanced holds the developer
// tools (code, compositions, lint).
export const RAIL_ITEMS: readonly RailItem[] = [
  { id: "media", icon: "media", label: "shell.tabMedia", tab: "assets" },
  { id: "text", icon: "text", label: "shell.tabText", tab: "text" },
  {
    id: "subtitles",
    icon: "subtitles",
    label: "shell.tabSubtitles",
    tab: "subtitles",
    captions: true,
  },
  { id: "audio", icon: "audio", label: "shell.tabAudio", tab: "audio" },
  { id: "elements", icon: "elements", label: "shell.tabElements", tab: "blocks" },
  { id: "layers", icon: "layers", label: "shell.tabLayers", tab: "layers", layers: true },
  { id: "advanced", icon: "advanced", label: "shell.advanced", tab: "code" },
];

const STORAGE_KEY = "sneepcut:studio-rail";

export function railItem(id: RailItemId): RailItem {
  return RAIL_ITEMS.find((item) => item.id === id) ?? RAIL_ITEMS[0];
}

/** Rail item for a side panel tab, used when the tab was chosen some other way. */
export function railItemForTab(tab: SidebarTab, current?: RailItemId): RailItemId {
  if (current && railItem(current).tab === tab) return current;
  if (tab === "blocks") return "elements";
  if (tab === "text") return "text";
  if (tab === "subtitles") return "subtitles";
  if (tab === "audio") return "audio";
  if (tab === "layers") return "layers";
  if (tab === "compositions" || tab === "code") return "advanced";
  return "media";
}

export function readPersistedRailItem(): RailItemId | null {
  try {
    const stored = safeLocalStorage()?.getItem(STORAGE_KEY);
    return RAIL_ITEMS.find((item) => item.id === stored)?.id ?? null;
  } catch {
    return null;
  }
}

export function persistRailItem(id: RailItemId) {
  try {
    safeLocalStorage()?.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable: the rail just won't be remembered */
  }
}
