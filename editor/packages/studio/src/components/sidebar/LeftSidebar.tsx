// The side panel next to the rail. The rail (shell/railItems) picks the tab; each tab is its
// own card: Media, Audio, Elemente / Text / Subtitrări (block catalog), Straturi and Avansat
// (Cod | Compoziții).
import {
  memo,
  useState,
  useCallback,
  useImperativeHandle,
  useRef,
  forwardRef,
  type ReactNode,
} from "react";
import { AssetsTab } from "./AssetsTab";
import { AudioPanel } from "./AudioPanel";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { safeLocalStorage } from "../../utils/safeStorage";
import { BlocksTab, type BlockPreviewInfo, type CatalogVariant } from "./BlocksTab";
import { LayersPanel } from "./LayersPanel";
import { AdvancedPanel } from "./AdvancedPanel";

export type SidebarTab =
  | "assets"
  | "audio"
  | "blocks"
  | "text"
  | "subtitles"
  | "layers"
  | "code"
  | "compositions";

export interface LeftSidebarHandle {
  selectTab: (tab: SidebarTab) => void;
  getTab: () => SidebarTab;
}

const STORAGE_KEY = "hf-studio-sidebar-tab";
const TABS: readonly SidebarTab[] = [
  "assets",
  "audio",
  "blocks",
  "text",
  "subtitles",
  "layers",
  "code",
  "compositions",
];

function isSidebarTab(value: string | null): value is SidebarTab {
  return value != null && (TABS as readonly string[]).includes(value);
}

// Both the `localStorage` reference and `getItem` can throw when site data is blocked. This runs
// as a `useState` initializer, so an unguarded throw would take the editor to the crash boundary.
export function getPersistedTab(): SidebarTab {
  let stored: string | null = null;
  try {
    stored = safeLocalStorage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    /* storage unavailable: fall back to the default tab */
  }
  return isSidebarTab(stored) ? stored : "assets";
}

const CATALOG_TABS: Partial<Record<SidebarTab, CatalogVariant>> = {
  blocks: "elements",
  text: "text",
  subtitles: "subtitles",
};

interface LeftSidebarProps {
  width?: number;
  projectId: string;
  compositions: string[];
  assets: string[];
  activeComposition: string | null;
  onSelectComposition: (comp: string) => void;
  onImportFiles?: (files: FileList, dir?: string) => void | Promise<string[] | void>;
  fileTree?: string[];
  editingFile?: { path: string; content: string | null } | null;
  onSelectFile?: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateFolder?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDuplicateFile?: (path: string) => void;
  onMoveFile?: (oldPath: string, newPath: string) => void;
  codeChildren?: ReactNode;
  onRenderComposition?: (comp: string) => void;
  isRendering?: boolean;
  onLint?: () => void;
  linting?: boolean;
  lintFindingCount?: number;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
  /** Kept for the shell's API; the rail collapses the panel. */
  onToggleCollapse?: () => void;
  onAddBlock?: (blockName: string) => void | Promise<void>;
  onPreviewBlock?: (preview: BlockPreviewInfo | null) => void;
  takeoverContent?: ReactNode;
  onAddAssetToTimeline?: (path: string) => void;
  onAddCompositionToTimeline?: (path: string) => void;
}

// fallow-ignore-next-line complexity
export const LeftSidebar = memo(
  forwardRef<LeftSidebarHandle, LeftSidebarProps>(function LeftSidebar(props, ref) {
    const { width = 312, takeoverContent } = props;
    const [tab, setTab] = useState<SidebarTab>(getPersistedTab);
    const tabRef = useRef(tab);
    tabRef.current = tab;

    const selectTab = useCallback((next: SidebarTab) => {
      setTab(next);
      try {
        safeLocalStorage()?.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable: the tab just won't be remembered */
      }
      trackStudioEvent("tab_switch", { panel: "left_sidebar", tab: next });
    }, []);
    const getTab = useCallback(() => tabRef.current, []);
    useImperativeHandle(ref, () => ({ selectTab, getTab }), [selectTab, getTab]);

    const mediaProps = {
      projectId: props.projectId,
      assets: props.assets,
      onImport: props.onImportFiles,
      onDelete: props.onDeleteFile,
      onRename: props.onRenameFile,
      onAddAssetToTimeline: props.onAddAssetToTimeline,
    };
    const catalog = CATALOG_TABS[tab];

    let content: ReactNode;
    if (takeoverContent) content = takeoverContent;
    else if (tab === "assets") content = <AssetsTab {...mediaProps} />;
    else if (tab === "audio") content = <AudioPanel {...mediaProps} />;
    else if (catalog)
      content = (
        <BlocksTab
          key={catalog}
          variant={catalog}
          onAddBlock={props.onAddBlock}
          onPreviewBlock={props.onPreviewBlock}
        />
      );
    else if (tab === "layers") content = <LayersPanel />;
    else
      content = (
        <AdvancedPanel
          view={tab === "compositions" ? "compositions" : "code"}
          onViewChange={selectTab}
          projectId={props.projectId}
          compositions={props.compositions}
          activeComposition={props.activeComposition}
          onSelectComposition={props.onSelectComposition}
          onAddCompositionToTimeline={props.onAddCompositionToTimeline}
          onRenderComposition={props.onRenderComposition}
          isRendering={props.isRendering}
          fileTree={props.fileTree}
          editingFile={props.editingFile}
          onSelectFile={props.onSelectFile}
          onCreateFile={props.onCreateFile}
          onCreateFolder={props.onCreateFolder}
          onDeleteFile={props.onDeleteFile}
          onRenameFile={props.onRenameFile}
          onDuplicateFile={props.onDuplicateFile}
          onMoveFile={props.onMoveFile}
          onImportFiles={props.onImportFiles}
          codeChildren={props.codeChildren}
          onLint={props.onLint}
          linting={props.linting}
          lintFindingCount={props.lintFindingCount}
          lintFindingsByFile={props.lintFindingsByFile}
        />
      );

    // No tabpanel role: the rail items are not tabs, and each panel is a <section> named by its
    // PanelCard title.
    return (
      <div
        data-left-sidebar={tab}
        id={`sidebar-panel-${tab}`}
        className="flex h-full min-h-0 flex-none flex-col"
        style={{ width }}
      >
        {content}
      </div>
    );
  }),
);
