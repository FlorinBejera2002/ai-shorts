import { useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PreviewPane } from "./nle/PreviewPane";
import { TimelinePane } from "./nle/TimelinePane";
import { PreviewOverlays } from "./nle/PreviewOverlays";
import {
  useTimelineEditCallbacks,
  type TimelineEditCallbackDeps,
} from "./nle/useTimelineEditCallbacks";
import { NLEProvider, useNLEContext } from "./nle/NLEContext";
import { CaptionTimeline } from "../captions/components/CaptionTimeline";
import { useStudioPlaybackContext, useStudioShellContext } from "../contexts/StudioContext";
import { useDomEditActionsContext, useDomEditSelectionContext } from "../contexts/DomEditContext";
import { TimelineEditProvider } from "../contexts/TimelineEditContext";
import { usePlayerStore, type TimelineElement } from "../player";
import type { BlockPreviewInfo } from "./sidebar/BlocksTab";
import type { GestureRecordingState } from "./editor/GestureRecordControl";
import { useTimelineSelectionPreviewSync } from "../hooks/useTimelineSelectionPreviewSync";
import { StudioAgentTools } from "../webmcp/StudioAgentTools";
import { SourceImportNotice } from "./SourceImportNotice";
import { t } from "../i18n/translate";
import { useIsPhone } from "./shell/useIsPhone";

type RenderClipContent = (
  element: TimelineElement,
  style: { clip: string; label: string },
) => ReactNode;
type TimelineDropPlacement = Pick<TimelineElement, "start" | "track">;

// The seven move/resize/split/razor handlers come from TimelineEditCallbackDeps
// (shared with useTimelineEditCallbacks); the rest are drop + wiring props.
export interface EditorShellProps extends TimelineEditCallbackDeps {
  /** Left sidebar (media/library), rendered in the top row. */
  left: ReactNode;
  /** Right panel (inspector/design) or null when collapsed, in the top row. */
  right: ReactNode;
  /** Hide the whole shell (e.g. while the storyboard view is active). */
  hidden?: boolean;
  timelineToolbar: ReactNode;
  renderClipContent: RenderClipContent;
  handleTimelineElementDelete: (element: TimelineElement) => Promise<void> | void;
  handleTimelineAssetDrop: (
    assetPath: string,
    placement: TimelineDropPlacement,
  ) => Promise<void> | void;
  handleTimelineBlockDrop?: (
    blockName: string,
    placement: TimelineDropPlacement,
  ) => Promise<void> | void;
  handleTimelineCompositionDrop?: (
    sourcePath: string,
    placement: TimelineDropPlacement,
  ) => Promise<void> | void;
  handlePreviewBlockDrop?: (
    blockName: string,
    position: { left: number; top: number },
  ) => Promise<void> | void;
  handleTimelineFileDrop: (
    files: File[],
    placement?: TimelineDropPlacement,
  ) => Promise<void> | void;
  setCompIdToSrc: (map: Map<string, string>) => void;
  setCompositionLoading: (loading: boolean) => void;
  shouldShowMotionPath: boolean;
  shouldShowSelectedDomBounds: boolean;
  blockPreview?: BlockPreviewInfo | null;
  isGestureRecording?: boolean;
  recordingState?: GestureRecordingState;
  onToggleRecording?: () => void;
  gestureOverlay?: ReactNode;
  /** Notice pinned to the top of the preview card (save paused). Floats while the shell is hidden. */
  previewNotice?: ReactNode;
}

// The CapCut-style shell: [left | preview | right] in a top row, with a
// full-width timeline spanning the bottom. Owns the shared player +
// composition-stack state via NLEProvider so both rows share one player.
export function EditorShell({
  left,
  right,
  hidden,
  timelineToolbar,
  renderClipContent,
  handleTimelineElementDelete,
  handleTimelineAssetDrop,
  handleTimelineBlockDrop,
  handleTimelineCompositionDrop,
  handlePreviewBlockDrop,
  handleTimelineFileDrop,
  handleTimelineElementMove,
  handleTimelineElementsMove,
  handleTimelineElementResize,
  handleTimelineGroupResize,
  handleToggleTrackHidden,
  setAudioGroupAttribute,
  handleGroupClips,
  setElementFxAttribute,
  handleBlockedTimelineEdit,
  handleTimelineElementSplit,
  handleRazorSplit,
  handleRazorSplitAll,
  setCompIdToSrc,
  setCompositionLoading,
  shouldShowMotionPath,
  shouldShowSelectedDomBounds,
  isGestureRecording,
  recordingState,
  onToggleRecording,
  blockPreview,
  gestureOverlay,
  previewNotice,
}: EditorShellProps) {
  const { projectId, activeCompPath, setActiveCompPath, handlePreviewIframeRef, showToast } =
    useStudioShellContext();
  const { refreshKey, captionEditMode, refreshPreviewDocumentVersion, timelineElements } =
    useStudioPlaybackContext();
  const {
    handleTimelineElementSelect,
    buildDomSelectionForTimelineElement,
    applyDomSelection,
    applyMarqueeSelection,
  } = useDomEditActionsContext();
  const { domEditSelection, domEditGroupSelections } = useDomEditSelectionContext();
  const selectedElementId = usePlayerStore((state) => state.selectedElementId);
  const selectedElementIds = usePlayerStore((state) => state.selectedElementIds);
  const reportTimelineSelectionNotFound = useCallback(() => {
    showToast(t("shell.selectionMissing"), "info");
  }, [showToast]);

  useTimelineSelectionPreviewSync({
    selectedElementId,
    selectedElementIds,
    timelineElements,
    domEditSelection,
    domEditGroupSelections,
    activeCompPath,
    buildDomSelectionForTimelineElement,
    applyDomSelection,
    applyMarqueeSelection,
    onSelectionNotFound: reportTimelineSelectionNotFound,
  });

  const timelineEditCallbacks = useTimelineEditCallbacks({
    handleTimelineElementMove,
    handleTimelineElementsMove,
    handleTimelineElementResize,
    handleTimelineGroupResize,
    handleToggleTrackHidden,
    setAudioGroupAttribute,
    handleGroupClips,
    setElementFxAttribute,
    handleBlockedTimelineEdit,
    handleTimelineElementSplit,
    handleRazorSplit,
    handleRazorSplitAll,
  });

  return (
    <div className={`flex min-h-0 flex-1 flex-col${hidden ? " hidden" : ""}`}>
      {/* While the storyboard hides the shell, the notice floats under the top bar. */}
      {hidden && previewNotice
        ? createPortal(
            <div className="fixed left-1/2 top-[76px] z-[92] w-[min(624px,calc(100vw-32px))] -translate-x-1/2">
              {previewNotice}
            </div>,
            document.body,
          )
        : null}
      <TimelineEditProvider value={timelineEditCallbacks}>
        <NLEProvider
          projectId={projectId}
          refreshKey={refreshKey}
          activeCompositionPath={activeCompPath}
          onIframeRef={handlePreviewIframeRef}
          onCompIdToSrcChange={setCompIdToSrc}
          onCompositionLoadingChange={setCompositionLoading}
          onCompositionChange={(compPath) => {
            // Sync activeCompPath when the user drills down via the timeline or
            // navigates back — keeps sidebar + thumbnails in sync. Guard no-ops to
            // avoid circular refresh cascades (activeCompPath → stack → onChange).
            if (compPath !== activeCompPath) {
              setActiveCompPath(compPath);
              refreshPreviewDocumentVersion();
            }
          }}
        >
          <EditorShellBody
            left={left}
            right={right}
            captionEditMode={captionEditMode}
            onSelectTimelineElement={handleTimelineElementSelect}
            onPreviewBlockDrop={handlePreviewBlockDrop}
            timelineToolbar={timelineToolbar}
            renderClipContent={renderClipContent}
            onFileDrop={handleTimelineFileDrop}
            onAssetDrop={handleTimelineAssetDrop}
            onBlockDrop={handleTimelineBlockDrop}
            onCompositionDrop={handleTimelineCompositionDrop}
            onDeleteElement={handleTimelineElementDelete}
            previewNotice={hidden ? null : previewNotice}
            previewOverlay={
              <PreviewOverlays
                shouldShowMotionPath={shouldShowMotionPath}
                shouldShowSelectedDomBounds={shouldShowSelectedDomBounds}
                blockPreview={blockPreview}
                isGestureRecording={isGestureRecording}
                recordingState={recordingState}
                onToggleRecording={onToggleRecording}
                gestureOverlay={gestureOverlay}
              />
            }
          />
        </NLEProvider>
      </TimelineEditProvider>
    </div>
  );
}

interface EditorShellBodyProps {
  left: ReactNode;
  right: ReactNode;
  captionEditMode: boolean;
  previewOverlay: ReactNode;
  onSelectTimelineElement: (element: TimelineElement | null) => void;
  onPreviewBlockDrop?: (
    blockName: string,
    position: { left: number; top: number },
  ) => Promise<void> | void;
  timelineToolbar: ReactNode;
  renderClipContent: RenderClipContent;
  onFileDrop: (files: File[], placement?: TimelineDropPlacement) => Promise<void> | void;
  onAssetDrop: (assetPath: string, placement: TimelineDropPlacement) => Promise<void> | void;
  onBlockDrop?: (blockName: string, placement: TimelineDropPlacement) => Promise<void> | void;
  onCompositionDrop?: (
    sourcePath: string,
    placement: TimelineDropPlacement,
  ) => Promise<void> | void;
  onDeleteElement: (element: TimelineElement) => Promise<void> | void;
  previewNotice?: ReactNode;
}

function EditorShellBody({
  left,
  right,
  captionEditMode,
  previewOverlay,
  onSelectTimelineElement,
  onPreviewBlockDrop,
  timelineToolbar,
  renderClipContent,
  onFileDrop,
  onAssetDrop,
  onBlockDrop,
  onCompositionDrop,
  onDeleteElement,
  previewNotice,
}: EditorShellBodyProps) {
  const { compositionStack, updateCompositionStack, containerRef } = useNLEContext();
  const isPhone = useIsPhone();

  // The caption track's blocks are seek targets; CaptionTimeline took an onSeek
  // prop that nothing ever passed, so clicking a block did nothing.
  const seekCaptionTime = useCallback((time: number) => {
    usePlayerStore.getState().requestSeek(time);
  }, []);

  // Keyboard: Escape to pop composition level
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && compositionStack.length > 1) {
        updateCompositionStack((prev) => prev.slice(0, -1));
      }
    },
    [compositionStack.length, updateCompositionStack],
  );

  return (
    <div
      ref={containerRef}
      data-studio-shell-body={isPhone ? "phone" : "desktop"}
      className={
        isPhone
          ? "relative flex min-h-0 flex-1 flex-col bg-studio-bg pb-[88px]"
          : "relative flex min-h-0 flex-1 flex-col bg-studio-bg px-3 pb-[11px]"
      }
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Renders nothing; exposes Studio's state to an agentic browser. Mounted
          here rather than in App because it needs the DomEdit contexts. */}
      <StudioAgentTools />
      {/* Cards row: rail, side panel, preview and inspector, 12px apart (St-Main). The
          9px bottom padding plus the 3px timeline height handle make the 12px gap above
          the timeline card. On phone the rail and inspector live in bars and sheets. */}
      <div
        className={
          isPhone
            ? "relative flex min-h-0 flex-1 flex-col"
            : "relative flex min-h-0 flex-1 flex-row pb-[9px] pt-3"
        }
      >
        {left}
        <div className="relative flex min-h-[160px] min-w-0 flex-1 flex-col sm:min-h-0">
          <PreviewPane
            previewOverlay={previewOverlay}
            onSelectTimelineElement={onSelectTimelineElement}
            onPreviewBlockDrop={onPreviewBlockDrop}
          />
          {/* Notices sit over the top of the preview card, under its header row. */}
          <div className="pointer-events-none absolute inset-x-4 top-[60px] z-20 flex flex-col items-center gap-2 empty:hidden [&>*]:pointer-events-auto">
            {previewNotice}
            <div className="max-w-full empty:hidden [&>*]:rounded-md [&>*]:bg-studio-surface [&>*]:shadow-studio">
              <SourceImportNotice />
            </div>
          </div>
        </div>
        {right}
      </div>

      {/* Full-width timeline card */}
      <TimelinePane
        timelineToolbar={timelineToolbar}
        renderClipContent={renderClipContent}
        onFileDrop={onFileDrop}
        onAssetDrop={onAssetDrop}
        onBlockDrop={onBlockDrop}
        onCompositionDrop={onCompositionDrop}
        onDeleteElement={onDeleteElement}
        onSelectTimelineElement={onSelectTimelineElement}
        timelineFooter={
          captionEditMode ? (
            <div className="flex-shrink-0" style={{ height: 60 }}>
              <div className="flex items-center gap-1.5 px-3 py-0.5">
                <span className="text-[11px] font-semibold text-studio-muted">
                  {t("shell.captions")}
                </span>
              </div>
              <CaptionTimeline pixelsPerSecond={100} onSeek={seekCaptionTime} />
            </div>
          ) : undefined
        }
      />
    </div>
  );
}
