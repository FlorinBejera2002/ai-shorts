import { useEffect, useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import {
  buildSourceCutChanges,
  sourceCutTargets,
  type SourceCutPatch,
} from "../../utils/sourceCutChanges";
import { saveProjectFilesWithHistory, type RecordEditInput } from "../../utils/studioFileHistory";
import type { DomEditSelection } from "./domEditingTypes";
import { getTimelineElementSourceFile } from "../../player/lib/timelineElementHelpers";
import { normalizeTimelineCompositionSource } from "./domEditingDom";

export interface SourceCutControlProps {
  selection: DomEditSelection;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
}

export function useSourceCutChanges({ selection, recordEdit }: SourceCutControlProps) {
  const files = useFileManagerContext();
  const { projectId, activeCompPath, writeBlockedReason, waitForPendingDomEditSaves } =
    useStudioShellContext();
  const { refreshKey, setRefreshKey } = useStudioPlaybackContext();
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  // A composition selection's sourceFile names its child contents. The cut
  // reference being changed belongs to the enclosing composition instead.
  const parentPath =
    normalizeTimelineCompositionSource(getTimelineElementSourceFile(selection.element)) ||
    activeCompPath ||
    "index.html";
  const selectedId = selection.id ?? selection.element.id;
  const { readProjectFile } = files;

  useEffect(() => {
    let cancelled = false;
    setSource(null);
    setError(null);
    void (async () => {
      const parent = await readProjectFile(parentPath);
      const target = sourceCutTargets(parent).find((item) => item.id === selectedId);
      if (!target) throw new Error("This source clip is no longer available.");
      const html = await readProjectFile(target.path);
      if (!cancelled) setSource(html);
    })().catch((cause) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : "Could not load clip settings.");
    });
    return () => {
      cancelled = true;
    };
  }, [parentPath, selectedId, readProjectFile, refreshKey]);

  async function saveSourceCutChanges({
    patch,
    label,
    applyToAll = false,
  }: {
    patch: SourceCutPatch;
    label: string;
    applyToAll?: boolean;
  }): Promise<void> {
    if (saving.current) throw new Error("Wait for the current clip change to finish.");
    if (!projectId || writeBlockedReason)
      throw new Error(writeBlockedReason ?? "No active project.");
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const pending = await files.flushPendingSourceSave();
      if (pending.status !== "clean") throw new Error("Save or resolve your source edits first.");
      await waitForPendingDomEditSaves();
      const parentHtml = await readProjectFile(parentPath);
      const targets = sourceCutTargets(parentHtml).filter(
        (item) => applyToAll || item.id === selectedId,
      );
      const sources: Record<string, string> = {};
      for (const target of targets) {
        if (!(target.path in sources)) sources[target.path] = await readProjectFile(target.path);
      }
      const changes = buildSourceCutChanges({
        parentPath,
        parentHtml,
        selectedId,
        sources,
        existingPaths: files.fileTree,
        patch,
        applyToAll,
      });
      for (const [path, content] of Object.entries(changes.copies)) {
        // Establish absence before creating a durable undo/redo copy. A racing
        // writer is rejected by the file API's If-None-Match precondition.
        if (await files.readOptionalProjectFile(path))
          throw new Error("Clip files changed. Try again.");
        await files.writeProjectFile(path, content);
      }
      const changed = await saveProjectFilesWithHistory({
        projectId,
        label,
        kind: "source",
        files: Object.fromEntries(
          Object.entries(changes.files).map(([path, edit]) => [path, edit.after]),
        ),
        readFile: async (path) => changes.files[path].before,
        writeFile: files.writeProjectFile,
        recordEdit,
      });
      for (const path of changed) files.updateEditingFileContent(path, changes.files[path].after);
      if (Object.keys(changes.copies).length) await files.refreshFileTree();
      if (changed.length) setRefreshKey((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save clip settings.");
      throw cause;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return { source, busy: busy || !!writeBlockedReason, error, saveSourceCutChanges };
}
