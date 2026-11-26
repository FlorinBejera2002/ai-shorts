import { useCallback, useState, type CSSProperties } from "react";
import type { StudioRightPanelProps } from "./StudioRightPanel.types";

export type { StudioRightPanelProps };
import { PropertyPanel } from "./editor/PropertyPanel";
import { SourceCutInspector } from "./editor/SourceCutInspector";
import { LayersPanel } from "./editor/LayersPanel";
import { CaptionPropertyPanel } from "../captions/components/CaptionPropertyPanel";
import { BlockParamsPanel } from "./editor/BlockParamsPanel";
import { RenderQueuePanel } from "./renders/RenderQueuePanel";
import { SlideshowPanel } from "./panels/SlideshowPanel";
import { VariablesPanel } from "./panels/VariablesPanel";
import { InspectorHeader, InspectorTabs, type InspectorTab } from "./inspector/InspectorChrome";
import { inspectorTitle } from "./inspector/inspectorTitle";
import { InspectorHeaderSlotContext, InspectorTitleContext } from "./inspector/headerSlot";
import { useIsPhone } from "./shell/useIsPhone";
import type { RenderJob } from "./renders/useRenderQueue";
import { STUDIO_FLAT_INSPECTOR_ENABLED } from "./editor/manualEditingAvailability";
import { useSlideshowPersist } from "../hooks/useSlideshowPersist";
import { useSlideshowTabState } from "../hooks/useSlideshowTabState";
import { DesignPanelPromoteProvider } from "./DesignPanelPromoteProvider";
import { useStudioPlaybackContext, useStudioShellContext } from "../contexts/StudioContext";
import { usePanelLayoutContext } from "../contexts/PanelLayoutContext";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { useDomEditContext } from "../contexts/DomEditContext";
import { usePlayerStore } from "../player";
import {
  applyColorGradingScopeUpdate,
  EMPTY_COLOR_GRADING_SCOPE_RESULT,
  type ColorGradingScope,
} from "./studioColorGradingScope";
import { timelineKeysForSelections } from "../utils/studioHelpers";
import { canHideSelections } from "../utils/timelineInspector";
import { useInspectorSplitResize } from "../hooks/useInspectorSplitResize";
import { useRemoveBackground } from "../hooks/useRemoveBackground";
import { t, useLocale } from "../i18n/translate";
import { PillButton } from "./ui";

// fallow-ignore-next-line complexity
export function StudioRightPanel({
  designPanelActive,
  activeBlockParams,
  onCloseBlockParams,
  recordingState,
  recordingDuration,
  onToggleRecording,
  sdkSession,
  publishSdkSession,
  forceReloadSdkSession,
  reloadPreview,
  domEditSaveTimestampRef,
  recordEdit,
  onToggleElementHidden,
  onAutoGroupCarveSources,
  onAddMediaOverlay,
}: StudioRightPanelProps) {
  // Re-render the panel chrome when the locale changes.
  useLocale();
  const isPhone = useIsPhone();
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const {
    rightWidth,
    setRightCollapsed,
    adjustPanelWidth,
    rightPanelTab,
    setRightPanelTab,
    rightInspectorPanes,
    toggleRightInspectorPane,
    setExclusiveRightInspectorPane,
    handlePanelResizeStart,
    handlePanelResizeMove,
    handlePanelResizeEnd,
  } = usePanelLayoutContext();

  const {
    previewIframeRef,
    projectId,
    activeCompPath,
    showToast,
    waitForPendingDomEditSaves,
    renderQueue,
  } = useStudioShellContext();
  const { captionEditMode, refreshKey } = useStudioPlaybackContext();

  const {
    domEditSelection,
    domEditGroupSelections,
    copiedAgentPrompt,
    clearDomSelection,
    handleUngroupSelection,
    handleGroupSelection,
    handleDomStyleCommit,
    handleDomAttributeCommit,
    handleDomAttributeLiveCommit,
    handleDomAttributeQuietCommit,
    handleDomHtmlAttributeCommit,
    handleDomAttributesCommit,
    handleDomPathOffsetCommit,
    handleDomBoxSizeCommit,
    handleDomRotationCommit,
    handleDomTextCommit,
    handleDomTextFieldStyleCommit,
    handleDomAddTextField,
    handleDomRemoveTextField,
    handleAskAgent,
    selectedGsapAnimations,
    gsapMultipleTimelines,
    gsapUnsupportedTimelinePattern,
    handleGsapUpdateProperty,
    handleGsapUpdateMeta,
    handleGsapDeleteAnimation,
    handleGsapAddAnimation,
    handleGsapAddProperty,
    handleGsapRemoveProperty,
    handleGsapUpdateFromProperty,
    handleGsapAddFromProperty,
    handleGsapRemoveFromProperty,
    commitAnimatedProperty,
    commitAnimatedProperties,
    handleSetArcPath,
    handleUpdateArcSegment,
    handleUnroll,
    handleUpdateKeyframeEase,
    handleUpdateSegmentEase,
    handleSetAllKeyframeEases,
    handleGsapAddKeyframe,
    handleGsapRemoveKeyframe,
    handleGsapConvertToKeyframes,
  } = useDomEditContext();

  const {
    assets,
    fontAssets,
    projectDir,
    handleImportFiles,
    handleImportFonts,
    refreshFileTree,
    readProjectFile,
    writeProjectFile,
    fileTree,
    editingFile,
  } = useFileManagerContext();

  // Discrete ops (toggle, reorder, add/delete, hotspot): persist immediately,
  // no coalescing — each is a distinct user action that deserves its own undo entry.
  const onPersistSlideshow = useSlideshowPersist({
    sdkSession,
    activeCompPath,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    domEditSaveTimestampRef,
    publishSdkSession,
  });

  // Notes path: persists are debounced in SlideshowPanel; coalesceKey ensures
  // rapid writes collapse into a single undo entry via the save-queue infra.
  const onPersistSlideshowNotes = useSlideshowPersist({
    sdkSession,
    activeCompPath,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    domEditSaveTimestampRef,
    publishSdkSession,
    coalesceKey: activeCompPath ? `slideshow-notes:${activeCompPath}` : "slideshow-notes",
  });

  const {
    layersPanePercent,
    splitContainerRef,
    handleInspectorSplitResizeStart,
    handleInspectorSplitResizeMove,
    handleInspectorSplitResizeEnd,
  } = useInspectorSplitResize();

  const renderJobs = renderQueue.jobs as RenderJob[];
  const inspectorTabActive = rightPanelTab === "design" || rightPanelTab === "layers";

  const { isSlideshowComposition, slideshowScenes } = useSlideshowTabState({
    editingFileContent: editingFile?.content,
    previewIframeRef,
    refreshKey,
    rightPanelTab,
    setRightPanelTab,
  });
  const designPaneOpen = inspectorTabActive && rightInspectorPanes.design && designPanelActive;
  const layersPaneOpen = inspectorTabActive && rightInspectorPanes.layers;

  const handleInspectorPaneButtonClick = (pane: "design" | "layers") => {
    if (!inspectorTabActive) {
      setRightPanelTab(pane);
      return;
    }
    // Flat inspector: Layers always renders full-height by itself (see the
    // render branch below), so the two panes are mutually exclusive here —
    // otherwise both tabs could show "active" while only one actually shows.
    if (STUDIO_FLAT_INSPECTOR_ENABLED) {
      setExclusiveRightInspectorPane(pane);
      return;
    }
    toggleRightInspectorPane(pane);
  };

  const handleApplyColorGradingScope = useCallback(
    async (scope: ColorGradingScope, value: string | null) =>
      applyColorGradingScopeUpdate({
        scope,
        value,
        selectedSourceFile: domEditSelection?.sourceFile || activeCompPath || "index.html",
        fileTree,
        projectId,
        domEditSaveTimestampRef,
        waitForPendingDomEditSaves,
        readProjectFile,
        writeProjectFile,
        recordEdit,
        reloadPreview,
        showToast,
      }).catch((error) => {
        showToast(
          `Couldn't apply color grading: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
        return EMPTY_COLOR_GRADING_SCOPE_RESULT;
      }),
    [
      activeCompPath,
      domEditSaveTimestampRef,
      domEditSelection?.sourceFile,
      fileTree,
      projectId,
      readProjectFile,
      recordEdit,
      reloadPreview,
      showToast,
      waitForPendingDomEditSaves,
      writeProjectFile,
    ],
  );

  const handleRemoveBackground = useRemoveBackground(projectId, refreshFileTree, showToast);

  /**
   * A dial being dragged writes to the preview and stops there.
   *
   * Every one of these panels previews on each pointermove and commits on
   * release. Persisting the moves too put a fragment of the drag in the undo
   * stack — and since those writes race, history could not coalesce them
   * reliably, so undo took back a sliver of the gesture rather than the gesture.
   * The release's own commit is what reaches the file and the undo stack.
   */
  const setAttributeWhileDragging = useCallback(
    (attr: string, value: string | null) =>
      handleDomAttributeLiveCommit(attr, value, undefined, { previewOnly: true }),
    [handleDomAttributeLiveCommit],
  );
  /** A debounced write that must reach the file and report whether it did. */
  const setAttributeCommitted = useCallback(
    (attr: string, value: string | null, onSettled?: (ok: boolean) => void) =>
      handleDomAttributeLiveCommit(attr, value, onSettled),
    [handleDomAttributeLiveCommit],
  );
  const handleHideAllSelected = () => {
    // Audio has no visual to hide, and `data-hidden` on an audio element is what
    // MUTES it — preview silences it and the render drops it from the mix. The
    // timeline withholds the eye on an audio track for that reason
    // (`visible={!isAudioTrack}`), and the single-selection panel gates the same
    // write on `audioSelection`; this multi-selection path was the way back to
    // it. Checked here as well as in the panel because the button is not the
    // only caller.
    if (!canHideSelections(domEditGroupSelections)) {
      showToast("Audio can't be hidden — use the group's own controls", "info");
      return;
    }
    const { elements } = usePlayerStore.getState();
    const keys = timelineKeysForSelections(domEditGroupSelections, elements, activeCompPath);
    if (keys.length > 0) void onToggleElementHidden?.(keys, true);
  };
  const propertyPanel = (
    <DesignPanelPromoteProvider
      selection={domEditGroupSelections.length > 1 ? null : domEditSelection}
      projectId={projectId}
      activeCompPath={activeCompPath}
      showToast={showToast}
      readProjectFile={readProjectFile}
      writeProjectFile={writeProjectFile}
      recordEdit={recordEdit}
      reloadPreview={reloadPreview}
      domEditSaveTimestampRef={domEditSaveTimestampRef}
      forceReloadSharedSdkSession={forceReloadSdkSession}
    >
      <SourceCutInspector
        selection={domEditGroupSelections.length > 1 ? null : domEditSelection}
        recordEdit={recordEdit}
      >
        <PropertyPanel
          projectId={projectId}
          projectDir={projectDir}
          assets={assets}
          element={domEditGroupSelections.length > 1 ? null : domEditSelection}
          multiSelectCount={domEditGroupSelections.length}
          multiSelectedElements={domEditGroupSelections}
          onGroupSelection={handleGroupSelection}
          onHideAllSelected={handleHideAllSelected}
          copiedAgentPrompt={copiedAgentPrompt}
          onClearSelection={clearDomSelection}
          onToggleElementHidden={onToggleElementHidden}
          onAutoGroupCarveSources={onAutoGroupCarveSources}
          onUngroup={handleUngroupSelection}
          onSetStyle={handleDomStyleCommit}
          onSetAttribute={handleDomAttributeCommit}
          onSetAttributes={handleDomAttributesCommit}
          onSetAttributeLive={setAttributeWhileDragging}
          onSetAttributeQuiet={handleDomAttributeQuietCommit}
          onSetAttributeCommitted={setAttributeCommitted}
          onApplyColorGradingScope={handleApplyColorGradingScope}
          onSetHtmlAttribute={handleDomHtmlAttributeCommit}
          onRemoveBackground={handleRemoveBackground}
          onSetManualOffset={handleDomPathOffsetCommit}
          onSetManualSize={handleDomBoxSizeCommit}
          onSetManualRotation={handleDomRotationCommit}
          onSetText={handleDomTextCommit}
          onSetTextFieldStyle={handleDomTextFieldStyleCommit}
          onAddTextField={handleDomAddTextField}
          onRemoveTextField={handleDomRemoveTextField}
          onAskAgent={handleAskAgent}
          onImportAssets={handleImportFiles}
          onAddMediaOverlay={onAddMediaOverlay}
          fontAssets={fontAssets}
          onImportFonts={handleImportFonts}
          previewIframeRef={previewIframeRef}
          gsapAnimations={selectedGsapAnimations}
          gsapMultipleTimelines={gsapMultipleTimelines}
          gsapUnsupportedTimelinePattern={gsapUnsupportedTimelinePattern}
          onUpdateGsapProperty={handleGsapUpdateProperty}
          onUpdateGsapMeta={handleGsapUpdateMeta}
          onDeleteGsapAnimation={handleGsapDeleteAnimation}
          onAddGsapProperty={handleGsapAddProperty}
          onRemoveGsapProperty={handleGsapRemoveProperty}
          onUpdateGsapFromProperty={handleGsapUpdateFromProperty}
          onAddGsapFromProperty={handleGsapAddFromProperty}
          onRemoveGsapFromProperty={handleGsapRemoveFromProperty}
          onAddGsapAnimation={handleGsapAddAnimation}
          onCommitAnimatedProperty={commitAnimatedProperty}
          onCommitAnimatedProperties={commitAnimatedProperties}
          onAddKeyframe={handleGsapAddKeyframe}
          onRemoveKeyframe={handleGsapRemoveKeyframe}
          onConvertToKeyframes={(animId, duration) =>
            handleGsapConvertToKeyframes(animId, undefined, duration)
          }
          onSeekToTime={(t) => usePlayerStore.getState().requestSeek(t)}
          onSetArcPath={handleSetArcPath}
          onUpdateArcSegment={handleUpdateArcSegment}
          onUnroll={handleUnroll}
          onUpdateKeyframeEase={handleUpdateKeyframeEase}
          onUpdateSegmentEase={handleUpdateSegmentEase}
          onSetAllKeyframeEases={handleSetAllKeyframeEases}
          recordingState={recordingState}
          recordingDuration={recordingDuration}
          onToggleRecording={onToggleRecording}
        />
      </SourceCutInspector>
    </DesignPanelPromoteProvider>
  );

  const renderQueuePanel = <RenderQueuePanel />;
  const advancedActive =
    rightPanelTab === "variables" ||
    rightPanelTab === "slideshow" ||
    rightPanelTab === "block-params";
  const title = inspectorTitle({
    captionEditMode,
    tab: rightPanelTab,
    inspectorTabActive,
    multiCount: domEditGroupSelections.length,
    selection: domEditSelection,
  });
  const tabs: InspectorTab[] = [
    {
      id: "design",
      label: t("inspector.tabDesign"),
      tooltip: t("inspector.tooltipDesign"),
      active: designPaneOpen,
      onSelect: () => handleInspectorPaneButtonClick("design"),
    },
    {
      id: "layers",
      label: t("inspector.tabLayers"),
      tooltip: t("inspector.tooltipLayers"),
      active: layersPaneOpen,
      onSelect: () => handleInspectorPaneButtonClick("layers"),
    },
    {
      id: "renders",
      label:
        renderJobs.length > 0
          ? t("inspector.tabRendersCount", { n: renderJobs.length })
          : t("inspector.tabRenders"),
      tooltip: t("inspector.tooltipRenders"),
      active: rightPanelTab === "renders",
      onSelect: () => setRightPanelTab("renders"),
    },
    {
      id: "advanced",
      label: t("inspector.tabAdvanced"),
      tooltip: t("inspector.advancedMenu"),
      active: advancedActive,
      onSelect: () => {},
    },
  ];
  const advancedItems = [
    ...(isSlideshowComposition
      ? [
          {
            id: "slideshow",
            label: t("inspector.tabSlideshow"),
            onSelect: () => setRightPanelTab("slideshow"),
          },
        ]
      : []),
    {
      id: "variables",
      label: t("inspector.tabVariables"),
      onSelect: () => setRightPanelTab("variables"),
    },
    {
      id: "block-params",
      label: t("inspector.tabBlockParams"),
      disabled: !activeBlockParams,
      onSelect: () => setRightPanelTab("block-params"),
    },
  ];

  const cutSelected = Boolean(domEditSelection?.element.hasAttribute("data-source-window"));

  return (
    <>
      {/* Vertical resize divider: 3px seam, 13px hit zone via the inner div. */}
      <div
        role="separator"
        aria-label={t("inspector.resize")}
        aria-orientation="vertical"
        tabIndex={0}
        className="group relative hidden w-[3px] flex-shrink-0 cursor-col-resize outline-none sm:block"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => handlePanelResizeStart("right", e)}
        onPointerMove={handlePanelResizeMove}
        onPointerUp={handlePanelResizeEnd}
        onPointerCancel={handlePanelResizeEnd}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          // Panel is right-anchored: ArrowLeft grows it, ArrowRight shrinks it.
          const delta = e.key === "ArrowLeft" ? 16 : -16;
          adjustPanelWidth("right", delta);
        }}
      >
        <div className="absolute inset-y-0 -left-[8px] w-[13px]" />
        <div className="absolute top-1/2 left-px h-[52px] w-px -translate-y-1/2 bg-transparent transition-colors group-hover:bg-[var(--st-bd)] group-focus-visible:bg-[var(--st-btn)] group-active:bg-[var(--st-t3)]" />
      </div>
      <div
        aria-label="Inspector panel"
        className="relative flex h-[38dvh] max-h-[45%] min-h-[140px] min-w-0 shrink-0 flex-col overflow-hidden rounded-card bg-studio-surface shadow-studio sm:h-auto sm:max-h-none sm:min-h-0 sm:w-[var(--inspector-width)]"
        style={{ "--inspector-width": `${rightWidth}px` } as CSSProperties}
      >
        <div className="flex flex-none flex-col gap-[18px] px-4 pt-4 pb-[18px]">
          <InspectorHeader
            title={titleOverride ?? title}
            phone={isPhone}
            onClose={() => setRightCollapsed(true)}
            slotRef={setHeaderSlot}
          />
          {!captionEditMode && !(designPaneOpen && cutSelected) && (
            // St-Main / St-M-ClipSheet: a selected cut shows its settings only. Straturi and
            // Avansat stay reachable from the rail ("Mai mult" on a phone), Randări from export;
            // elements (St-Inspector-Element) keep the tabs.
            <InspectorTabs tabs={tabs} advancedItems={advancedItems} />
          )}
        </div>
        <InspectorTitleContext value={setTitleOverride}>
          <InspectorHeaderSlotContext value={headerSlot}>
            {captionEditMode ? (
              <CaptionPropertyPanel iframeRef={previewIframeRef} />
            ) : (
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {rightPanelTab === "block-params" && activeBlockParams ? (
                  <BlockParamsPanel
                    blockName={activeBlockParams.blockName}
                    blockTitle={activeBlockParams.blockTitle}
                    params={activeBlockParams.params}
                    compositionPath={activeBlockParams.compositionPath}
                    onClose={onCloseBlockParams ?? (() => {})}
                  />
                ) : rightPanelTab === "slideshow" && isSlideshowComposition ? (
                  <SlideshowPanel
                    scenes={slideshowScenes}
                    onPersist={onPersistSlideshow}
                    onPersistNotes={onPersistSlideshowNotes}
                  />
                ) : rightPanelTab === "variables" ? (
                  <VariablesPanel
                    sdkSession={sdkSession}
                    publishSdkSession={publishSdkSession}
                    reloadPreview={reloadPreview}
                    domEditSaveTimestampRef={domEditSaveTimestampRef}
                    recordEdit={recordEdit}
                  />
                ) : layersPaneOpen && designPaneOpen && !STUDIO_FLAT_INSPECTOR_ENABLED ? (
                  <div ref={splitContainerRef} className="flex h-full min-h-0 min-w-0 flex-col">
                    <div
                      className="min-h-[120px] overflow-hidden"
                      style={{ flexBasis: `${layersPanePercent}%`, flexShrink: 0 }}
                    >
                      <LayersPanel />
                    </div>
                    <div
                      role="separator"
                      aria-label={t("inspector.resizeSplit")}
                      aria-orientation="horizontal"
                      className="group flex h-4 flex-shrink-0 cursor-row-resize items-center justify-center"
                      style={{ touchAction: "none" }}
                      onPointerDown={handleInspectorSplitResizeStart}
                      onPointerMove={handleInspectorSplitResizeMove}
                      onPointerUp={handleInspectorSplitResizeEnd}
                      onPointerCancel={handleInspectorSplitResizeEnd}
                    >
                      <div className="h-1 w-10 rounded-full bg-[var(--st-hd)] transition-colors group-hover:bg-[var(--st-t3)]" />
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">{propertyPanel}</div>
                  </div>
                ) : layersPaneOpen ? (
                  <LayersPanel />
                ) : designPaneOpen ? (
                  propertyPanel
                ) : inspectorTabActive ? (
                  // Inspector tab selected but no pane can render (panes toggled off, or the
                  // inspector is inactive during playback or recording): say so instead of
                  // silently rendering the render queue under a highlighted tab.
                  <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <p className="text-sm font-medium text-studio-muted">
                      {t("inspector.unavailable")}
                    </p>
                    <PillButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setRightPanelTab("renders")}
                    >
                      {t("inspector.showRenders")}
                    </PillButton>
                  </div>
                ) : (
                  renderQueuePanel
                )}
              </div>
            )}
          </InspectorHeaderSlotContext>
        </InspectorTitleContext>
      </div>
    </>
  );
}
