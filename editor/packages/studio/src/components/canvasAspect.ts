import { useState } from "react";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../contexts/StudioContext";
import { t } from "../i18n/translate";
import {
  changeCompositionAspect,
  compositionCanvasDimensions,
  COMPOSITION_ASPECTS,
  importedScenePaths,
} from "../utils/compositionAspectRatio";
import type { AgentRecordEdit } from "./agent/useAgentRun";

/** The six canvas formats, in board order: the presets, then "Original". */
export const CANVAS_FORMATS = [...COMPOSITION_ASPECTS.map((aspect) => aspect.label), "Original"];

export function canvasFormatLabel(format: string): string {
  return format === "Original" ? t("shell.formatOriginal") : format;
}

type FileManager = ReturnType<typeof useFileManagerContext>;

/** Reads every file the aspect change touches and returns their before/after contents. */
async function planAspectChange(files: FileManager, path: string, label: string) {
  const before = await files.readProjectFile(path);
  const after = changeCompositionAspect(before, label);
  const canvas = compositionCanvasDimensions(after);
  const changed: Record<string, { before: string; after: string }> = {
    [path]: { before, after },
  };
  for (const scenePath of importedScenePaths(before)) {
    const sceneBefore = await files.readProjectFile(scenePath);
    changed[scenePath] = {
      before: sceneBefore,
      after: changeCompositionAspect(sceneBefore, label, canvas),
    };
  }
  return changed;
}

/** Writes every file, rolling the written ones back if a later write fails. */
async function writeAll(
  files: FileManager,
  changed: Record<string, { before: string; after: string }>,
) {
  const written: string[] = [];
  try {
    for (const [filePath, edit] of Object.entries(changed)) {
      await files.writeProjectFile(filePath, edit.after, edit.before);
      written.push(filePath);
    }
  } catch (error) {
    for (const filePath of written.reverse()) {
      const edit = changed[filePath];
      await files.writeProjectFile(filePath, edit.before, edit.after);
    }
    throw error;
  }
}

/**
 * Canvas aspect state and the change action, shared by the desktop format menu and the
 * phone "Mai mult" grid. The change rewrites the composition (and its imported scenes) as
 * one undoable edit, then reloads the preview.
 */
export function useCanvasAspect(recordEdit: AgentRecordEdit) {
  const {
    activeCompPath,
    compositionDimensions,
    writeBlockedReason,
    waitForPendingDomEditSaves,
    showToast,
  } = useStudioShellContext();
  const { setRefreshKey } = useStudioPlaybackContext();
  const files = useFileManagerContext();
  const [busy, setBusy] = useState(false);
  const ratio = compositionDimensions
    ? compositionDimensions.width / compositionDimensions.height
    : 0;
  const value =
    COMPOSITION_ASPECTS.find((item) => Math.abs(item.width / item.height - ratio) < 0.001)?.label ??
    "";

  async function change(label: string) {
    if (busy || writeBlockedReason) return;
    setBusy(true);
    try {
      const save = await files.flushPendingSourceSave();
      if (save.status !== "clean") throw new Error(t("shell.canvasSaveFirst"));
      await waitForPendingDomEditSaves();
      const changed = await planAspectChange(files, activeCompPath ?? "index.html", label);
      await writeAll(files, changed);
      for (const [filePath, edit] of Object.entries(changed))
        files.updateEditingFileContent(filePath, edit.after);
      await recordEdit({ label: t("shell.canvasHistory"), kind: "source", files: changed });
      setRefreshKey((current) => current + 1);
      showToast(t("shell.canvasUpdated"), "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : t("shell.canvasFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return { value, busy, disabled: busy || !!writeBlockedReason, change };
}
