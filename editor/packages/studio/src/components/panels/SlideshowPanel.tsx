/**
 * SlideshowPanel — Studio right-panel tab for authoring the slideshow island.
 *
 * Four sub-surfaces:
 *   1. Slide list: scenes → toggle main-line slide; reorder via up/down arrows.
 *   2. Slide inspector: notes textarea; fragment hold-points.
 *   3. Branch tree: create/rename sequences; assign scenes to a branch.
 *   4. Hotspot tool: mark selected element as a hotspot on the active slide.
 *
 * State: the manifest is owned by useSlideshowManifestEditor, parsed from the
 * current composition HTML and persisted through onPersist / onPersistNotes.
 *
 * All manifest transforms are pure helpers — see slideshowPanelHelpers.ts.
 */

import { useState, useEffect, useCallback } from "react";
import type { SlideshowManifest } from "@hyperframes/core/slideshow";
import { usePlayerStore } from "../../player";
import { useDomEditSelectionContext } from "../../contexts/DomEditContext";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { t, useLocale } from "../../i18n/translate";
import { useSlideshowManifestEditor } from "../../hooks/useSlideshowManifestEditor";
import {
  SectionHeader,
  SlideList,
  SlideInspector,
  BranchTree,
  HotspotTool,
} from "./SlideshowSubPanels";
import { SlideshowStatusBar } from "./SlideshowStatusBar";
import type { SceneInfo } from "./slideshowPanelHelpers";

// Re-export pure helpers so the test file can import from "./SlideshowPanel".
export {
  toggleMainLineSlide,
  reorderMainLineSlide,
  reorderBranchSlide,
  setSlideNotes,
  addFragment,
  removeFragment,
  createSequence,
  renameSequence,
  deleteSequence,
  assignToBranch,
  addHotspot,
  removeHotspot,
} from "./slideshowPanelHelpers";
export type { SceneInfo } from "./slideshowPanelHelpers";
export {
  makeSlideshowNotesController,
  safeParseManifest,
  type NotesController,
} from "./slideshowPanelController";

// ── Component ─────────────────────────────────────────────────────────────

export interface SlideshowPanelProps {
  /** Scenes from the live clip manifest (passed from StudioRightPanel). */
  scenes: SceneInfo[];
  /**
   * Called with the updated manifest after every discrete edit (toggle, add,
   * delete, reorder, hotspot).  Notes changes use the debounced variant instead.
   */
  onPersist: (manifest: SlideshowManifest) => Promise<void>;
  /** Called with the updated manifest after the notes idle delay (~450 ms). */
  onPersistNotes: (manifest: SlideshowManifest) => Promise<void>;
}

type SectionKey = "slides" | "inspector" | "branches" | "hotspot";

/** Ctrl/Cmd+Z undo, scoped so it never fights the app-level file undo. */
function isPanelUndoShortcut(e: React.KeyboardEvent<HTMLElement>): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== "z") return false;
  const target = e.target instanceof HTMLElement ? e.target.tagName : "";
  return target !== "TEXTAREA" && target !== "INPUT";
}

export function SlideshowPanel({ scenes, onPersist, onPersistNotes }: SlideshowPanelProps) {
  useLocale();
  const { editingFile } = useFileManagerContext();
  const compHtml = editingFile?.content ?? null;
  const currentTime = usePlayerStore((s) => s.currentTime);
  const { domEditSelection } = useDomEditSelectionContext();

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    () => new Set<SectionKey>(["slides", "inspector"]),
  );

  const editor = useSlideshowManifestEditor({
    compHtml,
    selectedSceneId,
    selectedSequenceId,
    currentTime,
    onPersist,
    onPersistNotes,
  });
  const { manifest } = editor;

  // A composition switch leaves the branch selection pointing at another document.
  useEffect(() => {
    setSelectedSequenceId(null);
  }, [compHtml]);

  const toggleSection = useCallback((key: SectionKey) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSelectSlide = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
    setSelectedSequenceId(null);
  }, []);

  const handleSelectBranchSlide = useCallback((sequenceId: string, sceneId: string) => {
    setSelectedSceneId(sceneId);
    setSelectedSequenceId(sequenceId);
  }, []);

  const activeSlides = selectedSequenceId
    ? ((manifest.slideSequences ?? []).find((s) => s.id === selectedSequenceId)?.slides ?? [])
    : manifest.slides;
  const selectedSlide = activeSlides.find((s) => s.sceneId === selectedSceneId);
  const sequences = manifest.slideSequences ?? [];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isPanelUndoShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    editor.undo();
  };

  return (
    <div
      data-studio-slideshow
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4 text-studio-text"
      onKeyDown={handleKeyDown}
    >
      <SlideshowStatusBar
        persistError={editor.persistError}
        retrying={editor.retrying}
        undoDepth={editor.undoDepth}
        onRetry={editor.retryPersist}
        onUndo={editor.undo}
      />
      <SectionHeader
        expanded={expandedSections.has("slides")}
        onToggle={() => toggleSection("slides")}
      >
        {t("slides.titleCount", { n: manifest.slides.length })}
      </SectionHeader>
      {expandedSections.has("slides") && (
        <div>
          <SlideList
            scenes={scenes}
            slides={manifest.slides}
            selectedSceneId={selectedSceneId}
            onSelect={handleSelectSlide}
            onToggle={editor.toggleSlide}
            onReorder={editor.reorderSlide}
          />
        </div>
      )}

      <SectionHeader
        expanded={expandedSections.has("inspector")}
        onToggle={() => toggleSection("inspector")}
      >
        {selectedSceneId
          ? (scenes.find((s) => s.id === selectedSceneId)?.label ?? t("slides.inspector"))
          : t("slides.inspector")}
      </SectionHeader>
      {expandedSections.has("inspector") && (
        <>
          {selectedSceneId ? (
            <SlideInspector
              sceneId={selectedSceneId}
              slide={selectedSlide}
              currentTime={currentTime}
              onSetNotes={editor.setNotes}
              onMarkFragment={editor.markFragment}
              onRemoveFragment={editor.dropFragment}
            />
          ) : (
            <span className="text-[13px] font-medium text-[var(--st-t2)]">
              {t("slides.selectScene")}
            </span>
          )}
        </>
      )}

      <SectionHeader
        expanded={expandedSections.has("branches")}
        onToggle={() => toggleSection("branches")}
      >
        {t("slides.branchesCount", { n: sequences.length })}
      </SectionHeader>
      {expandedSections.has("branches") && (
        <BranchTree
          sequences={sequences}
          scenes={scenes}
          onCreateSequence={editor.addSequence}
          onRenameSequence={editor.renameSeq}
          onDeleteSequence={editor.deleteSeq}
          onAssign={editor.assignSequence}
          selectedSceneId={selectedSceneId}
          selectedSequenceId={selectedSequenceId}
          onSelectBranchSlide={handleSelectBranchSlide}
        />
      )}

      <SectionHeader
        expanded={expandedSections.has("hotspot")}
        onToggle={() => toggleSection("hotspot")}
      >
        {t("slides.hotspot")}
      </SectionHeader>
      {expandedSections.has("hotspot") && (
        <HotspotTool
          selectedSceneId={selectedSceneId}
          slide={selectedSlide}
          domEditSelection={domEditSelection}
          sequences={sequences}
          onAddHotspot={editor.addHotspotToScene}
          onRemoveHotspot={editor.removeHotspotFromScene}
        />
      )}
    </div>
  );
}
