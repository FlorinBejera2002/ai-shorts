import { useCallback, useRef } from "react";
import { t } from "../i18n/translate";
import { formatDecimalSeconds } from "../player/components/timelineDisplayTime";
import type { TimelineElement } from "../player";
import { usePlayerStore } from "../player";
import { getTimelineElementLabel } from "../utils/studioHelpers";
import { trackStudioRazorSplit } from "../telemetry/events";
import { canSplitElementAt, selectSplittableElements } from "../utils/timelineElementSplit";
import { buildAtomicCutIntents, runAtomicCutTransaction } from "../utils/razorSplitTransaction";
import type { RecordEditInput } from "./timelineEditingHelpers";

interface UseRazorSplitOptions {
  projectId: string | null;
  // fallow-ignore-next-line code-duplication
  activeCompPath: string | null;
  showToast: (message: string, tone?: "error" | "info") => void;
  writeProjectFile: (path: string, content: string, expectedContent?: string) => Promise<void>;
  observeProjectFileVersion?: (path: string, version: string | null) => void;
  recordEdit: (input: RecordEditInput) => Promise<void>;
  domEditSaveTimestampRef: React.MutableRefObject<number>;
  reloadPreview: () => void;
  forceReloadSdkSession?: () => void;
  isRecordingRef?: React.RefObject<boolean>;
}

export function useRazorSplit({
  projectId,
  activeCompPath,
  showToast,
  writeProjectFile,
  observeProjectFileVersion,
  recordEdit,
  domEditSaveTimestampRef,
  reloadPreview,
  forceReloadSdkSession,
  isRecordingRef,
}: UseRazorSplitOptions) {
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const synchronize = useCallback(() => {
    let failure: unknown;
    try {
      forceReloadSdkSession?.();
    } catch (error) {
      failure = error;
    }
    try {
      reloadPreview();
    } catch (error) {
      failure ??= error;
    }
    if (failure) throw failure;
  }, [forceReloadSdkSession, reloadPreview]);

  const runCut = useCallback(
    async (elements: readonly TimelineElement[], splitTime: number, mode: "single" | "all") => {
      const pid = projectIdRef.current;
      if (!pid || elements.length === 0) return;
      const intents = buildAtomicCutIntents(elements, splitTime, activeCompPath);
      const requestedCount = intents.reduce((count, file) => count + file.targets.length, 0);
      const label =
        mode === "single"
          ? t("timeline.histSplit")
          : t("timeline.histSplitAll", {
              n: requestedCount,
              time: formatDecimalSeconds(splitTime),
            });

      // Server writes arrive through the watcher before React can refresh. Keep
      // the existing short self-write window active for this owned transaction.
      domEditSaveTimestampRef.current = Date.now();
      const result = await runAtomicCutTransaction({
        projectId: pid,
        intents,
        label,
        writeProjectFile,
        recordEdit,
        observeProjectFileVersion,
        synchronize,
      });
      trackStudioRazorSplit({ mode, count: result.splitCount });
      if (result.syncFailed) {
        showToast(t("timeline.splitSyncFailed"), "error");
      }
      if (result.skippedSelectors.length > 0) {
        showToast(
          t("timeline.splitSelectorsSkipped", { selectors: result.skippedSelectors.join(", ") }),
          "info",
        );
      }
      return result;
    },
    [
      activeCompPath,
      domEditSaveTimestampRef,
      observeProjectFileVersion,
      recordEdit,
      showToast,
      synchronize,
      writeProjectFile,
    ],
  );

  const handleRazorSplit = useCallback(
    async (element: TimelineElement, splitTime: number) => {
      if (isRecordingRef?.current) {
        showToast(t("timeline.recordingBlocked"), "error");
        return;
      }
      if (!canSplitElementAt(element, splitTime)) return;
      try {
        const result = await runCut([element], splitTime, "single");
        if (!result) return;
        if (result.syncFailed) return;
        showToast(
          t("timeline.toastSplitOne", {
            label: getTimelineElementLabel(element),
            time: formatDecimalSeconds(splitTime),
          }),
          "info",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("timeline.splitFailed");
        showToast(message, "error");
      }
    },
    [isRecordingRef, runCut, showToast],
  );

  const handleRazorSplitAll = useCallback(
    async (splitTime: number) => {
      if (isRecordingRef?.current) {
        showToast(t("timeline.recordingBlocked"), "error");
        return;
      }
      const splittable = selectSplittableElements(usePlayerStore.getState().elements, splitTime);
      if (splittable.length === 0) return;
      try {
        const result = await runCut(splittable, splitTime, "all");
        if (!result) return;
        if (result.syncFailed) return;
        showToast(
          t("timeline.toastSplitAll", {
            n: result.splitCount,
            time: formatDecimalSeconds(splitTime),
          }),
          "info",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("timeline.splitAllFailed");
        showToast(message, "error");
      }
    },
    [isRecordingRef, runCut, showToast],
  );

  return { handleRazorSplit, handleRazorSplitAll };
}
