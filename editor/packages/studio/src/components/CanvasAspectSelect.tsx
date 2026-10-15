import { useState } from "react";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../contexts/StudioContext";
import {
  changeCompositionAspect,
  COMPOSITION_ASPECTS,
  importedScenePaths,
} from "../utils/compositionAspectRatio";
import type { StudioAssistantProps } from "./assistant/StudioAssistant";

export function CanvasAspectSelect({ recordEdit }: StudioAssistantProps) {
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
      if (save.status !== "clean")
        throw new Error("Save or resolve your source edits before changing the canvas.");
      await waitForPendingDomEditSaves();
      const path = activeCompPath ?? "index.html";
      const before = await files.readProjectFile(path);
      const after = changeCompositionAspect(before, label);
      const changed: Record<string, { before: string; after: string }> = {
        [path]: { before, after },
      };
      for (const scenePath of importedScenePaths(before)) {
        const sceneBefore = await files.readProjectFile(scenePath);
        changed[scenePath] = {
          before: sceneBefore,
          after: changeCompositionAspect(sceneBefore, label),
        };
      }
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
      for (const [filePath, edit] of Object.entries(changed))
        files.updateEditingFileContent(filePath, edit.after);
      await recordEdit({
        label: "Canvas aspect ratio",
        kind: "source",
        files: changed,
      });
      setRefreshKey((current) => current + 1);
      showToast("Canvas updated. Review text and overlays before exporting.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not change the canvas.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      aria-label="Video aspect ratio"
      value={value}
      disabled={busy || !!writeBlockedReason}
      onChange={(event) => void change(event.target.value)}
      className="h-9 max-w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-studio-accent sm:h-7"
    >
      <option value="" disabled>
        Canvas
      </option>
      {COMPOSITION_ASPECTS.map((aspect) => (
        <option key={aspect.label} value={aspect.label}>
          {aspect.label}
        </option>
      ))}
    </select>
  );
}
