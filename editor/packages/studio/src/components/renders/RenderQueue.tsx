import { memo, useEffect, useRef } from "react";
import { RenderQueueItem } from "./RenderQueueItem";
import { RenderExportForm, type StartRenderHandler } from "./RenderExportForm";
import type { FfmpegStatus } from "./useFfmpegStatus";
import type { RenderJob } from "./useRenderQueue";
import type { CompositionDimensions } from "./renderScale";
import { OutputButton } from "../output/OutputButton";
import { OutputNotice } from "../output/OutputFields";
import { illustrationSrc } from "../ui/illustrations";
import { t, useLocale } from "../../i18n/translate";

export type { CompositionDimensions } from "./renderScale";

interface RenderQueueProps {
  jobs: RenderJob[];
  projectId: string;
  onDelete: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onClearCompleted: () => void;
  onStartRender: StartRenderHandler;
  isRendering: boolean;
  /** History fetch failure (null when the last load succeeded). */
  loadError?: string | null;
  /** Retry a failed history load. */
  onRetryLoad?: () => void;
  /** True until the first history request settles. */
  historyLoading?: boolean;
  /** Finished renders hidden from this list (files stay on disk). */
  hiddenCount?: number;
  /** Bring the hidden renders back into the list. */
  onShowHidden?: () => void;
  /** Failure of a delete/cancel action, shown inline until dismissed. */
  actionError?: string | null;
  onDismissActionError?: () => void;
  /**
   * Authored dimensions of the active composition. Used to pick the
   * matching preset (landscape / portrait / square) when the user selects
   * a 1080p or 4K scale. `null` falls back to landscape (legacy default).
   */
  compositionDimensions?: CompositionDimensions | null;
  /**
   * Encoder availability, owned by useRenderQueue so the panel's Export button
   * and the header's agree. `null` means "no answer", not "missing".
   */
  ffmpeg: FfmpegStatus | null;
  ffmpegChecking: boolean;
  onRecheckFfmpeg: () => void;
}

function RenderCountLabel({ count }: { count: number }) {
  return count === 1 ? t("output.renderCountOne") : t("output.renderCountMany", { count });
}

/** Empty list (St-Inspector-RendersEmpty): illustration and one title. */
function RendersEmpty({
  hiddenCount,
  onShowHidden,
}: {
  hiddenCount: number;
  onShowHidden?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
      <img
        src={illustrationSrc("studio-exported")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-[120px] w-[120px] object-contain"
      />
      <b className="font-display text-[15px] font-semibold text-studio-text">
        {t("output.noRenders")}
      </b>
      {/* Hidden rows still exist on disk, so the list is not really empty: offer them back. */}
      {hiddenCount > 0 && onShowHidden ? (
        <span className="flex flex-col items-center gap-2 text-xs font-medium text-[var(--st-t2)]">
          <span>{t("output.hiddenRendersCount", { count: hiddenCount })}</span>
          <OutputButton
            variant="secondary"
            height={32}
            padX={12}
            fontSize={12}
            onClick={onShowHidden}
          >
            {t("output.showHiddenRenders")}
          </OutputButton>
        </span>
      ) : null}
    </div>
  );
}

/** Shown until the first history request settles, so a slow load is not read as "no renders". */
function RendersLoading() {
  return (
    <div role="status" className="flex items-center justify-center py-6">
      <span className="text-xs font-medium text-[var(--st-t2)]">{t("output.historyLoading")}</span>
    </div>
  );
}

/** History failed to load (St-Output-HistoryError): illustration, message and retry. */
function RendersLoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3.5 py-4 text-center">
      <img
        src={illustrationSrc("studio-export-failed")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-28 w-28 object-contain"
      />
      <b className="text-[13px] font-semibold text-studio-text">{message}</b>
      {onRetry ? (
        <OutputButton variant="primary" icon="refresh" onClick={onRetry}>
          {t("output.retry")}
        </OutputButton>
      ) : null}
    </div>
  );
}

/**
 * The Renders tab: the export form (St-Output-Export) above the list of renders
 * (St-Output-Rows), with the FFmpeg card, action errors and the empty and error states.
 */
export const RenderQueue = memo(function RenderQueue({
  jobs,
  projectId,
  onDelete,
  onCancel,
  onClearCompleted,
  onStartRender,
  isRendering,
  loadError,
  onRetryLoad,
  historyLoading = false,
  hiddenCount = 0,
  onShowHidden,
  actionError,
  onDismissActionError,
  compositionDimensions,
  ffmpeg,
  ffmpegChecking,
  onRecheckFfmpeg,
}: RenderQueueProps) {
  useLocale();
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest render in view when one is added.
  useEffect(() => {
    const list = listRef.current;
    if (list && jobs.length > 0) list.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  }, [jobs.length]);

  const completedCount = jobs.filter((j) => j.status !== "rendering").length;
  const lastRenderDurationMs = [...jobs]
    .reverse()
    .find((j) => j.status === "complete" && j.durationMs !== undefined)?.durationMs;

  return (
    <div
      data-studio-renders
      className="flex h-full min-h-0 min-w-0 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-4"
    >
      <RenderExportForm
        onStartRender={onStartRender}
        isRendering={isRendering}
        compositionDimensions={compositionDimensions}
        lastRenderDurationMs={lastRenderDurationMs}
        ffmpeg={ffmpeg}
        ffmpegChecking={ffmpegChecking}
        onRecheckFfmpeg={onRecheckFfmpeg}
      />

      <section aria-label={t("output.rendersTitle")} className="flex min-w-0 flex-col gap-2.5">
        {actionError ? (
          <OutputNotice onDismiss={onDismissActionError} dismissLabel={t("output.dismissError")}>
            {actionError}
          </OutputNotice>
        ) : null}
        {jobs.length > 0 ? (
          <div className="flex min-h-8 items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--st-t2)]">
              <RenderCountLabel count={jobs.length} />
            </span>
            {/* "Hide", not "Clear": files stay on disk (delete is per row and confirmed);
                hidden rows don't come back on reload. */}
            {completedCount > 0 ? (
              <OutputButton
                variant="ghost"
                height={32}
                padX={10}
                fontSize={12}
                onClick={onClearCompleted}
                title={t("output.hideFinishedTip")}
                aria-label={t("output.hideFinishedTitle")}
              >
                {t("output.hideFinished")}
              </OutputButton>
            ) : null}
          </div>
        ) : null}
        {loadError && jobs.length === 0 ? (
          <RendersLoadError message={loadError} onRetry={onRetryLoad} />
        ) : jobs.length === 0 ? (
          historyLoading ? (
            <RendersLoading />
          ) : (
            <RendersEmpty hiddenCount={hiddenCount} onShowHidden={onShowHidden} />
          )
        ) : (
          <div ref={listRef} className="flex min-w-0 flex-col gap-2.5">
            {jobs.map((job) => (
              <RenderQueueItem
                key={job.id}
                job={job}
                projectId={projectId}
                onDelete={() => onDelete(job.id)}
                onCancel={() => onCancel?.(job.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
});
