import { buildProjectApiPath } from "../../utils/projectRouting";
import { memo, useCallback, useState } from "react";
import { VideoFrameThumbnail } from "../ui/VideoFrameThumbnail";
import { illustrationSrc } from "../ui/illustrations";
import { OutputButton, OutputIconButton } from "../output/OutputButton";
import { OutputDialog, OutputIllustration } from "../output/OutputDialog";
import { OutputIcon } from "../output/OutputIcon";
import type { RenderJob } from "./useRenderQueue";
import { t, useLocale } from "../../i18n/translate";

interface RenderQueueItemProps {
  job: RenderJob;
  projectId: string;
  onDelete: () => void;
  onCancel: () => void;
}

export function formatRenderDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return t("output.timeJustNow");
  if (diff < 3600000) return t("output.timeMinutesAgo", { n: Math.floor(diff / 60000) });
  return t("output.timeHoursAgo", { n: Math.floor(diff / 3600000) });
}

function StatusDot({ tone }: { tone: "rendering" | "failed" | "muted" }) {
  const color =
    tone === "failed"
      ? "bg-[var(--st-danger)]"
      : tone === "muted"
        ? "bg-[var(--st-t3)]"
        : "animate-pulse bg-studio-text motion-reduce:animate-none";
  return <span aria-hidden="true" className={`h-2 w-2 rounded-full ${color}`} />;
}

/** "Ștergi exportul?" (St-DeleteExport): the delete illustration, the file name, two actions. */
export function DeleteRenderDialog({
  filename,
  open,
  onClose,
  onConfirm,
}: {
  filename: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useLocale();
  return (
    <OutputDialog
      open={open}
      title={t("output.deleteExportTitle")}
      onClose={onClose}
      width={420}
      footer={
        <>
          <OutputButton variant="secondary" onClick={onClose}>
            {t("output.keep")}
          </OutputButton>
          <OutputButton variant="dangerFill" onClick={onConfirm}>
            {t("output.deleteConfirm")}
          </OutputButton>
        </>
      }
    >
      <OutputIllustration src={illustrationSrc("delete")} size={160} caption={filename} />
    </OutputDialog>
  );
}

/** Stage, percent and a 4px bar for a render in progress. */
export function RenderProgress({ stage, progress }: { stage: string; progress: number }) {
  return (
    <span className="flex flex-col">
      <span className="flex justify-between gap-1.5 text-[11px] text-[var(--st-t2)]">
        <span className="truncate">{stage}</span>
        <span className="font-semibold tabular-nums text-studio-text">{progress}%</span>
      </span>
      <span
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("output.renderProgress", { progress })}
        className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--st-hd)]"
      >
        <span
          className="block h-full rounded-full bg-studio-text transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </span>
    </span>
  );
}

function RenderThumbnail({
  job,
  fileSrc,
  hovered,
  onOpen,
}: {
  job: RenderJob;
  fileSrc: string;
  hovered: boolean;
  onOpen: () => void;
}) {
  const [videoReady, setVideoReady] = useState(false);
  const isComplete = job.status === "complete";
  const tone =
    job.status === "rendering" ? "rendering" : job.status === "failed" ? "failed" : "muted";
  return (
    // A real button so keyboard users can open the render too.
    <button
      type="button"
      onClick={isComplete ? onOpen : undefined}
      disabled={!isComplete}
      aria-label={isComplete ? t("output.openRender", { filename: job.filename }) : undefined}
      className={`relative flex h-8 w-14 flex-none items-center justify-center overflow-hidden rounded-[10px] bg-[var(--st-sub)] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
        isComplete ? "cursor-pointer" : "cursor-default"
      }`}
    >
      {isComplete ? (
        <>
          {/* Live video fades in over the static frame once it can play. */}
          {hovered && (
            <video
              src={fileSrc}
              autoPlay
              muted
              loop
              playsInline
              onCanPlay={() => setVideoReady(true)}
              onEmptied={() => setVideoReady(false)}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-150"
              style={{ opacity: videoReady ? 1 : 0 }}
            />
          )}
          <span
            className="absolute inset-0 transition-opacity duration-150"
            style={{ opacity: hovered && videoReady ? 0 : 1 }}
          >
            <VideoFrameThumbnail src={fileSrc} />
          </span>
          {hovered && !videoReady ? (
            <span className="absolute inset-0 flex items-center justify-center bg-[rgba(21,32,53,0.32)]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-studio-surface text-studio-text">
                <OutputIcon name="play" size={11} />
              </span>
            </span>
          ) : null}
        </>
      ) : (
        <StatusDot tone={tone} />
      )}
    </button>
  );
}

function RenderStatusLine({ job }: { job: RenderJob }) {
  if (job.status === "rendering") {
    return (
      <RenderProgress stage={job.stage || t("output.rendering_stage")} progress={job.progress} />
    );
  }
  return (
    <>
      {job.status === "failed" && job.error ? (
        <span
          title={job.error}
          className="line-clamp-3 text-[11px] leading-[15px] text-[var(--st-danger)] [overflow-wrap:anywhere]"
        >
          {job.error}
        </span>
      ) : null}
      {job.status === "cancelled" ? (
        <span className="text-[11px] text-[var(--st-t2)]">{t("output.cancelled")}</span>
      ) : null}
      <span className="whitespace-nowrap text-[11px] text-[var(--st-t2)]">
        {formatTimeAgo(job.createdAt)}
      </span>
    </>
  );
}

/** One render in the Renders tab (St-Output-Rows): thumbnail, status, progress and actions. */
export const RenderQueueItem = memo(function RenderQueueItem({
  job,
  projectId,
  onDelete,
  onCancel,
}: RenderQueueItemProps) {
  useLocale();
  const [hovered, setHovered] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Direct file URL: serves from disk and survives server restarts.
  const fileSrc = buildProjectApiPath(projectId, `/renders/file/${job.filename}`);

  const handleOpen = useCallback(() => {
    window.open(fileSrc, "_blank");
  }, [fileSrc]);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = fileSrc;
      a.download = job.filename;
      a.click();
    },
    [fileSrc, job.filename],
  );

  const isComplete = job.status === "complete";
  const isRendering = job.status === "rendering";

  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      data-render-status={job.status}
      className="flex min-w-0 items-center gap-2.5 rounded-[14px] bg-studio-surface p-2.5 shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      <RenderThumbnail job={job} fileSrc={fileSrc} hovered={hovered} onOpen={handleOpen} />

      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <b
            title={job.filename}
            className="min-w-0 truncate text-xs font-semibold text-studio-text"
          >
            {job.filename}
          </b>
          {isComplete && job.durationMs ? (
            <span className="inline-flex h-5 flex-none items-center rounded-lg bg-[var(--st-sub)] px-2 text-xs font-semibold text-studio-text">
              {formatRenderDuration(job.durationMs)}
            </span>
          ) : null}
        </span>
        <RenderStatusLine job={job} />
      </span>

      {/* Actions stay in place so rows never shift. */}
      <span className="flex flex-none items-center gap-0.5">
        {isRendering ? (
          <OutputButton
            variant="secondary"
            height={32}
            padX={12}
            fontSize={12}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            {t("output.cancel")}
          </OutputButton>
        ) : (
          <>
            {isComplete ? (
              <OutputIconButton
                icon="download"
                label={t("output.downloadRender", { filename: job.filename })}
                onClick={handleDownload}
              />
            ) : null}
            <OutputIconButton
              icon="close"
              label={t("output.deleteRenderAria", { filename: job.filename })}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDelete(true);
              }}
            />
          </>
        )}
      </span>
      <DeleteRenderDialog
        filename={job.filename}
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          onDelete();
        }}
      />
    </div>
  );
});
