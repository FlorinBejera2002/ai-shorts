import type { UseDomEditCommitsParams } from "./useDomEditCommits";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { PatchOperation } from "../utils/sourcePatcher";
import type { PersistDomEditOperations } from "./domEditCommitTypes";
import { findUnsafeDomPatchValues } from "@hyperframes/core/studio-api/finite-mutation";
import { usePlayerStore } from "../player";
import {
  planRootCaptionEdit,
  rootCaptionElement,
  syncRootCaptionEdit,
} from "../utils/rootCaptionEdit";
import { readProjectFileContent, saveProjectFilesWithHistory } from "../utils/studioFileHistory";
import {
  applySoftReload,
  applySoftReloadFinalization,
  findGsapScriptElements,
} from "../utils/gsapSoftReload";
import { reseekPreviewRuntime } from "./timelineTrackVisibility";

type Dependencies = Pick<
  UseDomEditCommitsParams,
  | "activeCompPath"
  | "previewIframeRef"
  | "writeProjectFile"
  | "editHistory"
  | "domEditSaveTimestampRef"
  | "forceReloadSdkSession"
  | "reloadPreview"
  | "projectIdRef"
>;

/** One atomic source/history edit; no forked scene file is needed for root narration. */
export async function persistRootCaptionEdit(
  dependencies: Dependencies,
  selection: DomEditSelection,
  operations: PatchOperation[],
  options: Parameters<PersistDomEditOperations>[2],
  projectId: string,
): Promise<boolean> {
  if (!rootCaptionElement(selection)) return false;
  if (findUnsafeDomPatchValues({ operations }).length)
    throw new Error("Subtitle settings contain invalid layout values.");
  const path = selection.sourceFile || dependencies.activeCompPath || "index.html";
  const before = await readProjectFileContent(projectId, path);
  const currentTime = usePlayerStore.getState().currentTime;
  const edit = planRootCaptionEdit(before, selection, operations, currentTime);
  if (!edit) return false;
  if (options?.shouldSave && !options.shouldSave()) return true;
  if (dependencies.projectIdRef.current !== projectId)
    throw new Error("Active project changed before the subtitle could be saved.");
  if (options?.prepareContent) edit.after = options.prepareContent(edit.after, path);
  dependencies.domEditSaveTimestampRef.current = Date.now();
  await saveProjectFilesWithHistory({
    projectId,
    label: options?.label ?? "Edit cut subtitles",
    kind: "manual",
    coalesceKey: options?.coalesceKey,
    coalesceMs: options?.coalesceMs,
    files: { [path]: edit.after },
    readFile: async () => before,
    writeFile: dependencies.writeProjectFile,
    recordEdit: dependencies.editHistory.recordEdit,
  });
  syncRootCaptionEdit(selection, edit, path);
  dependencies.forceReloadSdkSession?.();
  if (edit.split) {
    const document = new DOMParser().parseFromString(edit.after, "text/html");
    const script = findGsapScriptElements(document)
      .map((node) => node.textContent ?? "")
      .join("\n");
    const oldDocument = new DOMParser().parseFromString(before, "text/html");
    const oldScript = findGsapScriptElements(oldDocument)
      .map((node) => node.textContent ?? "")
      .join("\n");
    // Static captions only changed their visibility windows. Rebind those
    // windows without replacing the existing composition timelines.
    if (
      script === oldScript &&
      applySoftReloadFinalization(dependencies.previewIframeRef.current, currentTime)
    )
      return true;
    const result = applySoftReload(dependencies.previewIframeRef.current, script, {
      currentTimeOverride: currentTime,
      authoredHtml: edit.after,
      onAsyncFailure: dependencies.reloadPreview,
    });
    if (result === "cannot-soft-reload") dependencies.reloadPreview();
  } else reseekPreviewRuntime(dependencies.previewIframeRef.current);
  return true;
}
