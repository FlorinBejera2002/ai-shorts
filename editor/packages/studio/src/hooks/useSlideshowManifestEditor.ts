import { useCallback, useEffect, useRef, useState } from "react";
import type { SlideHotspot, SlideshowManifest } from "@hyperframes/core/slideshow";
import {
  makeSlideshowNotesController,
  safeParseManifest,
  type NotesController,
} from "../components/panels/slideshowPanelController";
import {
  addFragment,
  addHotspot,
  assignToBranch,
  createSequence,
  deleteSequence,
  removeFragment,
  removeHotspot,
  renameSequence,
  reorderMainLineSlide,
  setSlideNotes,
  toggleMainLineSlide,
} from "../components/panels/slideshowPanelHelpers";
import { generateId } from "../utils/generateId";

const MAX_UNDO_DEPTH = 50;
const NOTES_PERSIST_DELAY_MS = 450;

export interface SlideshowManifestEditorOptions {
  compHtml: string | null;
  selectedSceneId: string | null;
  selectedSequenceId: string | null;
  currentTime: number;
  /** Persists after every discrete edit (toggle, add, delete, reorder, hotspot). */
  onPersist: (manifest: SlideshowManifest) => Promise<void>;
  /** Persists after the notes idle delay. */
  onPersistNotes: (manifest: SlideshowManifest) => Promise<void>;
}

/**
 * Owns the slideshow manifest for the open composition: parsing, discrete and
 * debounced-notes persistence, the in-panel undo history and every edit action.
 * Selection stays with the component; the options carry the current selection.
 */
export function useSlideshowManifestEditor({
  compHtml,
  selectedSceneId,
  selectedSequenceId,
  currentTime,
  onPersist,
  onPersistNotes,
}: SlideshowManifestEditorOptions) {
  const [manifest, setManifest] = useState<SlideshowManifest>(() =>
    compHtml ? safeParseManifest(compHtml) : { slides: [] },
  );
  // The composition HTML the manifest state was derived from. When the HTML
  // changes, the state is re-derived during render (React's "adjust state on
  // prop change" pattern) rather than in an effect, so there is no stale frame.
  const [derivedFromHtml, setDerivedFromHtml] = useState<string | null>(compHtml);
  // Persist failure surfacing: edits keep working in memory, but the user must
  // know the file write failed (and be able to retry) — never silent data loss.
  const [persistError, setPersistError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // In-panel undo history of manifest snapshots (discrete edits only).
  const undoStackRef = useRef<SlideshowManifest[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  // Latest manifest, so discrete handlers always operate on the freshest state.
  const manifestRef = useRef<SlideshowManifest>(manifest);
  // Pairs each pending notes update with the callback that owns it, so a flush
  // always writes to the composition the notes were typed in.
  const [notesCtrl] = useState<NotesController>(makeSlideshowNotesController);

  if (derivedFromHtml !== compHtml) {
    setDerivedFromHtml(compHtml);
    setManifest(compHtml ? safeParseManifest(compHtml) : { slides: [] });
    // History belongs to one composition — a switch starts fresh.
    setUndoDepth(0);
    setPersistError(false);
  }

  useEffect(() => {
    // Flush pending notes for the OLD composition before switching to the new one.
    notesCtrl.flush();
    undoStackRef.current = [];
  }, [compHtml, notesCtrl]);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  // Flush any pending notes persist when the component unmounts so we never
  // silently drop an edit the user made right before navigating away.
  useEffect(() => {
    return () => {
      notesCtrl.flush();
    };
  }, [notesCtrl]);

  /** Discrete actions (toggle, reorder, add/delete, hotspot): persist immediately. */
  const applyManifest = useCallback(
    async (next: SlideshowManifest, opts?: { skipUndo?: boolean }) => {
      // Fold any in-flight typed notes into the discrete manifest so they are
      // not silently dropped when the debounce timer would have fired later.
      const merged = notesCtrl.mergeIntoDiscrete(next);
      if (!opts?.skipUndo) {
        undoStackRef.current.push(manifestRef.current);
        if (undoStackRef.current.length > MAX_UNDO_DEPTH) undoStackRef.current.shift();
        setUndoDepth(undoStackRef.current.length);
      }
      setManifest(merged);
      manifestRef.current = merged;
      // Surface persist failures instead of swallowing them at each call site.
      try {
        await onPersist(merged);
        setPersistError(false);
      } catch (err) {
        console.error("[slideshow] failed to persist manifest edit:", err);
        setPersistError(true);
      }
    },
    [onPersist, notesCtrl],
  );

  /**
   * Notes path: update in-memory state immediately for a responsive UI, but
   * debounce the disk persist to ~450 ms after the last keystroke.
   */
  const applyNotesManifest = useCallback(
    (next: SlideshowManifest) => {
      setManifest(next);
      manifestRef.current = next;
      notesCtrl.schedule(next, onPersistNotes, NOTES_PERSIST_DELAY_MS);
    },
    [onPersistNotes, notesCtrl],
  );

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    setUndoDepth(undoStackRef.current.length);
    applyManifest(prev, { skipUndo: true }).catch(() => {});
  }, [applyManifest]);

  const retryPersist = useCallback(async () => {
    setRetrying(true);
    try {
      await onPersist(manifestRef.current);
      setPersistError(false);
    } catch (err) {
      console.error("[slideshow] retry persist failed:", err);
    } finally {
      setRetrying(false);
    }
  }, [onPersist]);

  /** Runs a discrete edit against the freshest manifest. */
  const commit = useCallback(
    (edit: (current: SlideshowManifest) => SlideshowManifest) => {
      applyManifest(edit(manifestRef.current)).catch(() => {});
    },
    [applyManifest],
  );

  const toggleSlide = useCallback(
    (sceneId: string) => commit((m) => toggleMainLineSlide(m, sceneId)),
    [commit],
  );

  const reorderSlide = useCallback(
    (sceneId: string, dir: "up" | "down") => commit((m) => reorderMainLineSlide(m, sceneId, dir)),
    [commit],
  );

  const setNotes = useCallback(
    (notes: string) => {
      if (!selectedSceneId) return;
      applyNotesManifest(
        setSlideNotes(manifestRef.current, selectedSceneId, notes, selectedSequenceId ?? undefined),
      );
    },
    [selectedSceneId, selectedSequenceId, applyNotesManifest],
  );

  const markFragment = useCallback(() => {
    if (!selectedSceneId) return;
    commit((m) => addFragment(m, selectedSceneId, currentTime, selectedSequenceId ?? undefined));
  }, [selectedSceneId, selectedSequenceId, currentTime, commit]);

  const dropFragment = useCallback(
    (time: number) => {
      if (!selectedSceneId) return;
      commit((m) => removeFragment(m, selectedSceneId, time, selectedSequenceId ?? undefined));
    },
    [selectedSceneId, selectedSequenceId, commit],
  );

  // Sequence ids are generated here so the component never mints persistence ids.
  const addSequence = useCallback(
    (label: string) => {
      const id = `seq-${generateId()}`;
      commit((m) => createSequence(m, id, label));
    },
    [commit],
  );

  const renameSeq = useCallback(
    (id: string, label: string) => commit((m) => renameSequence(m, id, label)),
    [commit],
  );

  // Confirmation is inline in BranchItem (consistent with the FileTree/assets
  // delete pattern); by the time this fires the user has already confirmed.
  const deleteSeq = useCallback((id: string) => commit((m) => deleteSequence(m, id)), [commit]);

  const assignSequence = useCallback(
    (sequenceId: string, sceneId: string, assign: boolean) =>
      commit((m) => assignToBranch(m, sequenceId, sceneId, assign)),
    [commit],
  );

  const addHotspotToScene = useCallback(
    (sceneId: string, hotspot: SlideHotspot) =>
      commit((m) => addHotspot(m, sceneId, hotspot, selectedSequenceId ?? undefined)),
    [selectedSequenceId, commit],
  );

  const removeHotspotFromScene = useCallback(
    (sceneId: string, hotspotId: string) =>
      commit((m) => removeHotspot(m, sceneId, hotspotId, selectedSequenceId ?? undefined)),
    [selectedSequenceId, commit],
  );

  return {
    manifest,
    persistError,
    retrying,
    undoDepth,
    undo,
    retryPersist,
    toggleSlide,
    reorderSlide,
    setNotes,
    markFragment,
    dropFragment,
    addSequence,
    renameSeq,
    deleteSeq,
    assignSequence,
    addHotspotToScene,
    removeHotspotFromScene,
  };
}
