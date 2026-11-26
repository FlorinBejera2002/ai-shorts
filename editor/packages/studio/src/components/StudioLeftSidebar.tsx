import { useCallback, type RefObject } from "react";
import { SourceEditor } from "./editor/SourceEditor";
import { LeftSidebar, type LeftSidebarHandle } from "./sidebar/LeftSidebar";
import { MediaPreview } from "./MediaPreview";
import { isMediaFile } from "../utils/mediaTypes";
import { usePanelLayoutContext } from "../contexts/PanelLayoutContext";
import { useStudioShellContext } from "../contexts/StudioContext";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { t, useLocale } from "../i18n/translate";
import { getPersistedRenderSettings } from "./renders/renderSettings";
import type { BlockPreviewInfo } from "./sidebar/BlocksTab";
import type { AgentRecordEdit } from "./agent/useAgentRun";
import { PhoneLeftTools } from "./shell/PhoneLeftTools";
import { StudioRail } from "./shell/StudioRail";
import { useIsPhone } from "./shell/useIsPhone";
import { useRailNavigation } from "./shell/useRailNavigation";

export interface StudioLeftSidebarProps {
  leftSidebarRef: RefObject<LeftSidebarHandle | null>;
  onSelectComposition: (comp: string) => void;
  onAddBlock: (blockName: string) => void;
  onPreviewBlock?: (preview: BlockPreviewInfo | null) => void;
  onLint: () => void;
  linting: boolean;
  lintFindingCount?: number;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
  onAddAssetToTimeline?: (path: string) => void;
  onAddCompositionToTimeline?: (path: string) => void;
  /** Records the phone "Mai mult" format change in the undo history. */
  recordEdit?: AgentRecordEdit;
}

type SidePanelProps = Omit<StudioLeftSidebarProps, "recordEdit"> & {
  width?: number;
  onToggleCollapse?: () => void;
};

/** The side panel itself (Media, catalog, compositions, code), shared by desktop and phone. */
// fallow-ignore-next-line complexity
function SidePanel({
  leftSidebarRef,
  width,
  onToggleCollapse,
  onSelectComposition,
  onAddBlock,
  onPreviewBlock,
  onLint,
  linting,
  lintFindingCount,
  lintFindingsByFile,
  onAddAssetToTimeline,
  onAddCompositionToTimeline,
}: SidePanelProps) {
  const { setRightPanelTab, setRightCollapsed } = usePanelLayoutContext();
  const { projectId, renderQueue, waitForPendingDomEditSaves } = useStudioShellContext();
  const files = useFileManagerContext();
  const { editingFile } = files;

  const handleRenderComposition = useCallback(
    async (comp: string) => {
      // startRender refuses without an encoder, so nothing unfinishable gets
      // queued either way. What it cannot do from here is show the reason, so
      // put the install prompt in front of the user, then stop.
      if (renderQueue.ffmpegMissing) {
        setRightPanelTab("renders");
        setRightCollapsed(false);
        return;
      }
      await waitForPendingDomEditSaves();
      const { format, quality, fps } = getPersistedRenderSettings();
      await renderQueue.startRender({ composition: comp, format, quality, fps });
    },
    [renderQueue, waitForPendingDomEditSaves, setRightPanelTab, setRightCollapsed],
  );

  return (
    <LeftSidebar
      ref={leftSidebarRef}
      width={width}
      projectId={projectId}
      compositions={files.compositions}
      assets={files.assets}
      activeComposition={editingFile?.path ?? null}
      onSelectComposition={onSelectComposition}
      fileTree={files.fileTree}
      editingFile={editingFile}
      onSelectFile={files.handleFileSelect}
      onCreateFile={files.handleCreateFile}
      onCreateFolder={files.handleCreateFolder}
      onDeleteFile={files.handleDeleteFile}
      onRenameFile={files.handleRenameFile}
      onDuplicateFile={files.handleDuplicateFile}
      onMoveFile={files.handleMoveFile}
      onImportFiles={async (list, dir) => {
        await files.handleImportFiles(list, dir);
      }}
      codeChildren={
        editingFile ? (
          isMediaFile(editingFile.path) ? (
            <MediaPreview projectId={projectId} filePath={editingFile.path} />
          ) : editingFile.content == null ? (
            // Never mount the editor on unloaded content: a keystroke would
            // autosave an empty document over the real file.
            <div className="flex h-full items-center justify-center text-[11px] text-studio-muted">
              {editingFile.path}…
            </div>
          ) : (
            <SourceEditor
              content={editingFile.content}
              filePath={editingFile.path}
              onChange={files.handleContentChange}
              revealOffset={files.revealSourceOffset}
            />
          )
        ) : undefined
      }
      onRenderComposition={handleRenderComposition}
      isRendering={renderQueue.isRendering}
      onLint={onLint}
      linting={linting}
      lintFindingCount={lintFindingCount}
      lintFindingsByFile={lintFindingsByFile}
      onToggleCollapse={onToggleCollapse}
      onAddBlock={onAddBlock}
      onPreviewBlock={onPreviewBlock}
      onAddAssetToTimeline={onAddAssetToTimeline}
      onAddCompositionToTimeline={onAddCompositionToTimeline}
    />
  );
}

/** 12px gap between the side panel and the preview that doubles as the width handle. */
function SidePanelResizeHandle() {
  const { adjustPanelWidth, handlePanelResizeStart, handlePanelResizeMove, handlePanelResizeEnd } =
    usePanelLayoutContext();
  return (
    <div
      role="separator"
      aria-label={t("shell.resizeSidebar")}
      title={t("shell.resizeSidebar")}
      aria-orientation="vertical"
      tabIndex={0}
      data-shell-resize="left"
      className="group relative w-3 flex-none cursor-col-resize outline-none"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => handlePanelResizeStart("left", e)}
      onPointerMove={handlePanelResizeMove}
      onPointerUp={handlePanelResizeEnd}
      onPointerCancel={handlePanelResizeEnd}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        adjustPanelWidth("left", e.key === "ArrowLeft" ? -16 : 16);
      }}
    >
      {/* Visible only while hovered, dragged or focused: a 2px line centred in the gap. */}
      <div className="absolute inset-y-0 left-[5px] w-0.5 rounded-full bg-transparent transition-colors group-hover:bg-[var(--st-tx)] group-focus-visible:bg-[var(--st-tx)] group-active:bg-[var(--st-tx)]" />
    </div>
  );
}

export function StudioLeftSidebar(props: StudioLeftSidebarProps) {
  useLocale();
  const isPhone = useIsPhone();
  const { effectiveLeftCollapsed, leftWidth, toggleLeftSidebar } = usePanelLayoutContext();
  const rail = useRailNavigation(props.leftSidebarRef);
  const { recordEdit, ...panelProps } = props;

  if (isPhone) {
    return (
      <PhoneLeftTools
        rail={rail}
        recordEdit={recordEdit}
        lintFindingCount={props.lintFindingCount}
        onLint={props.onLint}
        renderPanel={() => <SidePanel {...panelProps} />}
      />
    );
  }

  return (
    <>
      <StudioRail
        active={rail.active}
        collapsed={effectiveLeftCollapsed}
        onSelect={(id) => {
          // Pressing the item that is already open hides the side panel (St-Shell-Collapsed);
          // the collapsed rail's sidebar button brings it back.
          if (id === rail.active && !effectiveLeftCollapsed) {
            toggleLeftSidebar();
            return;
          }
          rail.select(id, { expand: true });
        }}
        onExpand={toggleLeftSidebar}
      />
      {effectiveLeftCollapsed ? (
        <div aria-hidden="true" className="w-3 flex-none" />
      ) : (
        <>
          <div aria-hidden="true" className="w-3 flex-none" />
          <SidePanel {...panelProps} width={leftWidth} onToggleCollapse={toggleLeftSidebar} />
          <SidePanelResizeHandle />
        </>
      )}
    </>
  );
}
