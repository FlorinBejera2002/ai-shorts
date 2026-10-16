import { useEffect, useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import {
  prepareSourceCutChanges,
  sourceCutTargets,
  type SourceCutPatch,
  type SourceCutTarget,
} from "../../utils/sourceCutChanges";
import { saveProjectFilesWithHistory, type RecordEditInput } from "../../utils/studioFileHistory";
import type { DomEditSelection } from "./domEditingTypes";
import { getTimelineElementSourceFile } from "../../player/lib/timelineElementHelpers";
import { normalizeTimelineCompositionSource } from "./domEditingDom";
import { syncSourceCutPreview } from "../../utils/sourceCutPreview";
import { notifySourceCutChange, useSourceCutRevision } from "../../utils/sourceCutRevision";
import { buildProjectApiPath } from "../../utils/projectRouting";

export interface SourceCutControlProps {
  selection: DomEditSelection;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
}

export function useSourceCutChanges({ selection, recordEdit }: SourceCutControlProps) {
  const files = useFileManagerContext();
  const {
    projectId,
    activeCompPath,
    writeBlockedReason,
    waitForPendingDomEditSaves,
    previewIframeRef,
  } = useStudioShellContext();
  const { refreshKey, setRefreshKey } = useStudioPlaybackContext();
  const [source, setSource] = useState<string | null>(null);
  const [parentSource, setParentSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useSourceCutRevision();
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
    setParentSource(null);
    setError(null);
    void (async () => {
      const parent = await readProjectFile(parentPath);
      const target = sourceCutTargets(parent).find((item) => item.id === selectedId);
      if (!target) throw new Error("This source clip is no longer available.");
      const html = await readProjectFile(target.path);
      if (!cancelled) {
        setSource(html);
        setParentSource(parent);
      }
    })().catch((cause) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : "Could not load clip settings.");
    });
    return () => {
      cancelled = true;
    };
  }, [parentPath, selectedId, readProjectFile, refreshKey, revision]);

  async function saveSourceCutChanges({
    patch,
    label,
    applyToAll = false,
    patchParent,
  }: {
    patch: SourceCutPatch;
    label: string;
    applyToAll?: boolean;
    patchParent?: (html: string, targets: SourceCutTarget[]) => string;
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
      const changes = await prepareSourceCutChanges(
        {
          parentPath,
          parentHtml,
          selectedId,
          sources,
          existingPaths: files.fileTree,
          patch,
          applyToAll,
          patchParent,
          preserveNamespace: true,
        },
        async (path) => {
          const response = await fetch(
            buildProjectApiPath(projectId, `/files/${encodeURIComponent(path)}`),
          );
          if (response.status === 404) {
            files.observeProjectFileVersion(path, null);
            return false;
          }
          if (!response.ok) throw new Error(`Could not check ${path}.`);
          return true;
        },
      );
      for (const [path, content] of Object.entries(changes.copies)) {
        // The preflight established absence; a racing writer is still rejected
        // by the file API's If-None-Match precondition.
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
      if (changed.length) {
        if (
          !syncSourceCutPreview(
            previewIframeRef?.current ?? null,
            parentPath,
            parentHtml,
            changes,
            () => setRefreshKey((current) => current + 1),
          )
        )
          setRefreshKey((current) => current + 1);
        notifySourceCutChange();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save clip settings.");
      throw cause;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return {
    source,
    parentSource,
    targets: parentSource ? sourceCutTargets(parentSource) : [],
    busy: busy || !!writeBlockedReason,
    error,
    saveSourceCutChanges,
  };
}
