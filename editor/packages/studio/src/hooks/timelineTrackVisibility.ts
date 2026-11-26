import { useCallback } from "react";
import { t } from "../i18n/translate";
import { usePlayerStore, type TimelineElement } from "../player";
import { reseekPreviewAtTime } from "../player/hooks/timelineSyncHydration";
import { useExpandedTimelineElements } from "../player/hooks/useExpandedTimelineElements";
import { applySoftReloadFinalization } from "../utils/gsapSoftReload";
import {
  timelineTrackOrder,
  trackDisplayNumber,
  trackDisplaySuffix,
} from "../player/components/timelineTrackDisplay";
import { patchProjectFilesWithHistory } from "../utils/studioFileHistory";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import { isAudioTimelineElement } from "../utils/timelineInspector";
import { readTagSnippetByTarget, type PatchOperation } from "../utils/sourcePatcher";
import {
  applyPatchByTarget,
  buildPatchTarget,
  findTimelineElementInIframe,
  readFileContent,
  type RecordEditInput,
} from "./timelineEditingHelpers";

export interface MutableRef<T> {
  current: T;
}

interface ReadonlyRef<T> {
  readonly current: T;
}

interface ToggleTimelineTrackHiddenInput {
  projectId: string;
  activeCompPath: string | null;
  timelineElements: readonly TimelineElement[];
  track: number;
  hidden: boolean;
  /** The row the CLICKED control announced. Absent when the caller has no
   *  rendered number to hand over, which falls back to deriving one. */
  displayNumber?: number | null;
  previewIframe: HTMLIFrameElement | null;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  domEditSaveTimestampRef: MutableRef<number>;
  pendingTimelineEditPathRef: MutableRef<Set<string>>;
}

interface ToggleTimelineElementHiddenInput extends Omit<ToggleTimelineTrackHiddenInput, "track"> {
  /** One timeline key, or several to hide/show in a single atomic file write. */
  elementKey: string | readonly string[];
}

interface SetElementsHiddenInput {
  projectId: string;
  activeCompPath: string | null;
  elements: readonly TimelineElement[];
  hidden: boolean;
  label: string;
  previewIframe: HTMLIFrameElement | null;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  domEditSaveTimestampRef: MutableRef<number>;
  pendingTimelineEditPathRef: MutableRef<Set<string>>;
}

interface UseTimelineTrackVisibilityEditingInput extends Omit<
  ToggleTimelineTrackHiddenInput,
  "projectId" | "track" | "hidden" | "previewIframe"
> {
  projectIdRef: ReadonlyRef<string | null>;
  previewIframeRef: ReadonlyRef<HTMLIFrameElement | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  isRecordingRef?: ReadonlyRef<boolean>;
  forceReloadSdkSession?: () => void;
}

export interface UseTimelineElementVisibilityEditingInput extends Omit<
  ToggleTimelineElementHiddenInput,
  "projectId" | "elementKey" | "hidden" | "previewIframe" | "timelineElements"
> {
  projectIdRef: ReadonlyRef<string | null>;
  previewIframeRef: ReadonlyRef<HTMLIFrameElement | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  isRecordingRef?: ReadonlyRef<boolean>;
  forceReloadSdkSession?: () => void;
}

/** A save conflict is shown in the UI language; other failures keep their own message. */
export function visibilityFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof StudioFileConflictError) {
    return t("shell.saveConflict", { file: error.filePath });
  }
  return error instanceof Error ? error.message : fallback;
}

function getTimelineElementTargetPath(
  element: TimelineElement,
  activeCompPath: string | null,
): string {
  return element.sourceFile || activeCompPath || "index.html";
}

function patchLiveHiddenState(
  iframe: HTMLIFrameElement | null,
  elements: readonly TimelineElement[],
  hidden: boolean,
  activeCompPath: string | null,
): void {
  for (const element of elements) {
    const target = findTimelineElementInIframe(iframe, element, activeCompPath);
    if (!target) continue;
    if (hidden) {
      target.setAttribute("data-hidden", "");
    } else {
      target.removeAttribute("data-hidden");
    }
  }
}

export function reseekPreviewRuntime(iframe: HTMLIFrameElement | null): void {
  const store = usePlayerStore.getState();
  if (applySoftReloadFinalization(iframe, store.currentTime)) return;
  reseekPreviewAtTime({ seek: store.requestSeek }, store.currentTime);
}

export function groupElementsByTargetPath(
  elements: readonly TimelineElement[],
  activeCompPath: string | null,
): Map<string, TimelineElement[]> {
  const byPath = new Map<string, TimelineElement[]>();
  for (const element of elements) {
    const targetPath = getTimelineElementTargetPath(element, activeCompPath);
    const existing = byPath.get(targetPath);
    if (existing) {
      existing.push(element);
    } else {
      byPath.set(targetPath, [element]);
    }
  }
  return byPath;
}

// fallow-ignore-next-line complexity
async function setElementsHidden({
  projectId,
  activeCompPath,
  elements,
  hidden,
  label,
  previewIframe,
  writeProjectFile,
  recordEdit,
  domEditSaveTimestampRef,
  pendingTimelineEditPathRef,
}: SetElementsHiddenInput): Promise<string[]> {
  if (elements.length === 0) return [];

  patchLiveHiddenState(previewIframe, elements, hidden, activeCompPath);
  reseekPreviewRuntime(previewIframe);

  const hiddenOperation: PatchOperation = {
    type: "attribute",
    property: "hidden",
    value: hidden ? "" : null,
  };
  const groups = [...groupElementsByTargetPath(elements, activeCompPath)];

  try {
    // The patch is built under the file locks: reading the file before them let an
    // undo or another save land first, and the write then expected stale bytes (409).
    domEditSaveTimestampRef.current = Date.now();
    const changedPaths = await patchProjectFilesWithHistory({
      label,
      kind: "timeline",
      paths: groups.map(([targetPath]) => targetPath),
      readFile: (path) => readFileContent(projectId, path),
      patchFiles: async (readFile) => {
        const files: Record<string, string> = {};
        const contents = await Promise.all(groups.map(([targetPath]) => readFile(targetPath)));
        for (const [index, [targetPath, fileElements]] of groups.entries()) {
          let patchedContent = contents[index];
          for (const element of fileElements) {
            const patchTarget = buildPatchTarget(element);
            if (!patchTarget) {
              throw new Error(`Timeline element ${element.id} is missing a patchable target`);
            }
            if (readTagSnippetByTarget(patchedContent, patchTarget) === undefined) {
              throw new Error(`Unable to patch timeline element ${element.id} in ${targetPath}`);
            }
            patchedContent = applyPatchByTarget(patchedContent, patchTarget, hiddenOperation);
          }
          files[targetPath] = patchedContent;
          pendingTimelineEditPathRef.current.add(targetPath);
        }
        return files;
      },
      writeFile: writeProjectFile,
      recordEdit,
    });
    domEditSaveTimestampRef.current = Date.now();
    for (const element of elements) {
      usePlayerStore.getState().updateElement(element.key ?? element.id, { hidden });
    }
    return changedPaths;
  } catch (error) {
    // The optimistic live patch already ran; a patch-target/save failure here would
    // otherwise leave the preview showing the wrong visibility until a reload. Revert
    // the live DOM to the prior state so what's on screen matches what persisted.
    patchLiveHiddenState(previewIframe, elements, !hidden, activeCompPath);
    reseekPreviewRuntime(previewIframe);
    throw error;
  }
}

export async function toggleTimelineTrackHidden({
  projectId,
  activeCompPath,
  timelineElements,
  track,
  hidden,
  displayNumber,
  previewIframe,
  writeProjectFile,
  recordEdit,
  domEditSaveTimestampRef,
  pendingTimelineEditPathRef,
}: ToggleTimelineTrackHiddenInput): Promise<string[]> {
  // `track` is the fractional sort key the callback needs; the history entry is
  // read by a human, so it gets the display row instead — the one the clicked
  // control announced, when the caller passed it. Deriving it again here would
  // use ascending element-bearing keys, which stop matching the header as soon
  // as an audio group reorders the rows and inserts an anchor: the same click
  // then said "Mute track 2" and recorded "Mute track 1".
  const suffix = trackDisplaySuffix(
    displayNumber ?? trackDisplayNumber(timelineTrackOrder(timelineElements), track),
  );
  const trackElements = timelineElements.filter((element) => element.track === track);
  const isAudioOnlyTrack = trackElements.length > 0 && trackElements.every(isAudioTimelineElement);
  // The undo history shows this label, so it follows the UI language.
  const label = t(
    isAudioOnlyTrack
      ? hidden
        ? "timeline.muteTrack"
        : "timeline.unmuteTrack"
      : hidden
        ? "timeline.hideTrack"
        : "timeline.showTrack",
    { suffix },
  );
  return setElementsHidden({
    projectId,
    activeCompPath,
    elements: trackElements,
    hidden,
    label,
    previewIframe,
    writeProjectFile,
    recordEdit,
    domEditSaveTimestampRef,
    pendingTimelineEditPathRef,
  });
}

export async function toggleTimelineElementHidden({
  projectId,
  activeCompPath,
  timelineElements,
  elementKey,
  hidden,
  previewIframe,
  writeProjectFile,
  recordEdit,
  domEditSaveTimestampRef,
  pendingTimelineEditPathRef,
}: ToggleTimelineElementHiddenInput): Promise<string[]> {
  const keys = new Set(typeof elementKey === "string" ? [elementKey] : elementKey);
  const elements = timelineElements.filter((item) => keys.has(item.key ?? item.id));
  return setElementsHidden({
    projectId,
    activeCompPath,
    elements,
    hidden,
    label:
      elements.length > 1
        ? hidden
          ? `Hide ${elements.length} elements`
          : `Show ${elements.length} elements`
        : hidden
          ? "Hide element"
          : "Show element",
    previewIframe,
    writeProjectFile,
    recordEdit,
    domEditSaveTimestampRef,
    pendingTimelineEditPathRef,
  });
}

export function useTimelineTrackVisibilityEditing({
  projectIdRef,
  activeCompPath,
  showToast,
  writeProjectFile,
  recordEdit,
  domEditSaveTimestampRef,
  previewIframeRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
  forceReloadSdkSession,
}: UseTimelineTrackVisibilityEditingInput): (
  track: number,
  hidden: boolean,
  displayNumber?: number | null,
) => Promise<void> {
  // Resolve the eye toggle against the EXPANDED rows the canvas actually renders:
  // virtual sub-comp children carry their own (display.track + idx) track numbers,
  // so filtering the raw store list by a virtual track number would hide the wrong
  // outer-scene sibling sharing that index.
  const expandedElements = useExpandedTimelineElements();
  return useCallback(
    async (track: number, hidden: boolean, displayNumber?: number | null) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) return;
      try {
        await toggleTimelineTrackHidden({
          projectId: pid,
          activeCompPath,
          timelineElements: expandedElements,
          track,
          hidden,
          displayNumber,
          previewIframe: previewIframeRef.current,
          writeProjectFile,
          recordEdit,
          domEditSaveTimestampRef,
          pendingTimelineEditPathRef,
        });
        forceReloadSdkSession?.();
      } catch (error) {
        console.error("[Timeline] Failed to toggle track visibility", error);
        showToast(visibilityFailureMessage(error, "Failed to toggle track visibility"));
      }
    },
    [
      activeCompPath,
      expandedElements,
      previewIframeRef,
      writeProjectFile,
      recordEdit,
      domEditSaveTimestampRef,
      pendingTimelineEditPathRef,
      isRecordingRef,
      showToast,
      forceReloadSdkSession,
      projectIdRef,
    ],
  );
}

export function useTimelineElementVisibilityEditing({
  projectIdRef,
  activeCompPath,
  showToast,
  writeProjectFile,
  recordEdit,
  domEditSaveTimestampRef,
  previewIframeRef,
  pendingTimelineEditPathRef,
  isRecordingRef,
  forceReloadSdkSession,
}: UseTimelineElementVisibilityEditingInput): (
  elementKey: string | readonly string[],
  hidden: boolean,
) => Promise<void> {
  // Resolve against the EXPANDED rows, not the raw store list — a nested
  // sub-composition child has no entry of its own in the raw list (only its
  // host does), so an elementKey for such a child (the
  // `sourceFile#domId`-shaped virtual key `resolveTimelineIdForSelection`
  // falls back to) would never match anything there and Hide All would
  // silently no-op for it. The expanded list synthesizes a real, patchable
  // TimelineElement (with matching key/domId/sourceFile) for each visible
  // child whenever its host is currently expanded.
  const expandedElements = useExpandedTimelineElements();
  return useCallback(
    async (elementKey: string | readonly string[], hidden: boolean) => {
      if (isRecordingRef?.current) {
        showToast("Cannot edit timeline while recording", "error");
        return;
      }
      const pid = projectIdRef.current;
      if (!pid) return;
      try {
        await toggleTimelineElementHidden({
          projectId: pid,
          activeCompPath,
          timelineElements: expandedElements,
          elementKey,
          hidden,
          previewIframe: previewIframeRef.current,
          writeProjectFile,
          recordEdit,
          domEditSaveTimestampRef,
          pendingTimelineEditPathRef,
        });
        forceReloadSdkSession?.();
      } catch (error) {
        console.error("[Timeline] Failed to toggle element visibility", error);
        showToast(visibilityFailureMessage(error, "Failed to toggle element visibility"));
      }
    },
    [
      activeCompPath,
      expandedElements,
      previewIframeRef,
      writeProjectFile,
      recordEdit,
      domEditSaveTimestampRef,
      pendingTimelineEditPathRef,
      isRecordingRef,
      showToast,
      forceReloadSdkSession,
      projectIdRef,
    ],
  );
}
