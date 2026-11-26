// Dialogs that follow the header's Export: progress (St-Rendering), done (St-Exported) and
// failure (St-ExportFailed). The render itself is the same job the Renders list shows, so
// closing a dialog never stops it.
import { useLocale, t } from "../../i18n/translate";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { clipsUrlFromReferrer } from "../StudioBackButton";
import { OutputButton } from "../output/OutputButton";
import { OutputDialog } from "../output/OutputDialog";
import { illustrationSrc } from "../ui/illustrations";
import { VideoFrameThumbnail } from "../ui/VideoFrameThumbnail";
import { useIsPhone } from "../shell/useIsPhone";
import type { RenderJob } from "./useRenderQueue";
import { renderMetaParts, type CompositionDimensions } from "./renderScale";

export interface ExportFlowDialogsProps {
  job: RenderJob | null;
  projectId: string;
  onDismiss: () => void;
  /** "Toate exporturile": close the flow and show the Renders list. Defaults to onDismiss. */
  onShowAll?: () => void;
  onCancel: (jobId: string) => void;
  onRetry: () => void;
  /** Composition size, for the "1080p" part of the meta line when the render used Auto. */
  compositionDimensions?: CompositionDimensions | null;
  /** Clip length in seconds, the "0:08" that leads the done dialog's meta line. */
  durationSeconds?: number | null;
}

/** Publish page of the SneepCut app that opened Studio, when it is known. */
export function publishUrlFromReferrer(referrer: string, ownOrigin: string): string | null {
  const clips = clipsUrlFromReferrer(referrer, ownOrigin);
  return clips ? clips.replace(/\/dashboard\/clips$/, "/dashboard/publish/new") : null;
}

function fileExtension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toUpperCase() : "";
}

function Illustration({
  name,
  size,
}: {
  name: Parameters<typeof illustrationSrc>[0];
  size: number;
}) {
  return (
    <img
      src={illustrationSrc(name)}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="mx-auto block object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function RenderingBody({ job, meta }: { job: RenderJob; meta: string[] }) {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Illustration name="studio-rendering" size={112} />
      <span className="font-display text-[30px] font-semibold leading-9 tabular-nums">
        {job.progress}%
      </span>
      <div
        role="progressbar"
        aria-label={t("output.renderProgress", { progress: job.progress })}
        aria-valuenow={job.progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--st-hd)]"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--st-btn)] transition-[width] duration-300"
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <span className="text-center text-[13px] font-medium text-[var(--st-t2)] [overflow-wrap:anywhere]">
        {[job.filename, ...meta].join(" · ")}
      </span>
    </div>
  );
}

function DoneBody({ job, fileSrc, meta }: { job: RenderJob; fileSrc: string; meta: string[] }) {
  const isPhone = useIsPhone();
  const ext = fileExtension(job.filename);
  return (
    <div className="flex flex-col gap-3.5">
      <Illustration name="studio-exported" size={isPhone ? 96 : 120} />
      <div className="flex min-w-0 items-center gap-5">
        <a
          href={fileSrc}
          target="_blank"
          rel="noreferrer"
          aria-label={t("output.playRender", { filename: job.filename })}
          className="relative block h-[234px] w-[132px] flex-none overflow-hidden rounded-xl bg-[var(--st-sub)]"
        >
          <VideoFrameThumbnail src={fileSrc} />
        </a>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
          <b className="text-[15px] font-semibold [overflow-wrap:anywhere]">{job.filename}</b>
          {meta.length > 0 ? (
            <span className="text-[13px] font-medium text-[var(--st-t2)]">{meta.join(" · ")}</span>
          ) : null}
          {ext ? (
            <span className="inline-flex h-6 items-center rounded-lg bg-studio-surface px-2 text-xs font-semibold text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)]">
              {ext}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FailedBody({ job }: { job: RenderJob }) {
  return (
    <div className="flex flex-col items-center gap-3.5">
      <Illustration name="studio-export-failed" size={120} />
      <span className="text-center text-sm font-medium leading-5 text-[var(--st-t2)] [overflow-wrap:anywhere]">
        {job.error ?? t("output.exportFailedTitle")}
      </span>
    </div>
  );
}

export function ExportFlowDialogs({
  job,
  projectId,
  onDismiss,
  onShowAll,
  onCancel,
  onRetry,
  compositionDimensions,
  durationSeconds,
}: ExportFlowDialogsProps) {
  useLocale();
  const isPhone = useIsPhone();
  if (!job || job.status === "cancelled") return null;
  const meta = renderMetaParts(job, compositionDimensions);
  const fileSrc = buildProjectApiPath(projectId, `/renders/file/${job.filename}`);

  if (job.status === "rendering") {
    return (
      <OutputDialog
        open
        title={t("output.renderingTitle")}
        onClose={onDismiss}
        width={440}
        raised
        doneLabel={t("output.hide")}
        testId="export-flow-rendering"
        footer={
          <OutputButton variant="secondary" onClick={() => onCancel(job.id)}>
            {t("output.cancel")}
          </OutputButton>
        }
      >
        <RenderingBody job={job} meta={meta} />
      </OutputDialog>
    );
  }

  if (job.status === "failed") {
    return (
      <OutputDialog
        open
        title={t("output.exportFailedTitle")}
        onClose={onDismiss}
        width={440}
        raised
        role="alertdialog"
        testId="export-flow-failed"
        footer={
          <>
            <OutputButton variant="ghost" onClick={onDismiss}>
              {t("feedback.close")}
            </OutputButton>
            <OutputButton variant="primary" icon="refresh" onClick={onRetry}>
              {t("output.tryAgain")}
            </OutputButton>
          </>
        }
      >
        <FailedBody job={job} />
      </OutputDialog>
    );
  }

  const publishUrl = publishUrlFromReferrer(document.referrer, window.location.origin);
  const download = () => {
    const a = document.createElement("a");
    a.href = fileSrc;
    a.download = job.filename;
    a.click();
  };
  const fileActions = (
    <>
      <OutputButton
        variant="secondary"
        height={isPhone ? 48 : 40}
        icon="download"
        onClick={download}
      >
        {t("output.download")}
      </OutputButton>
      {publishUrl ? (
        <OutputButton
          variant="primary"
          height={isPhone ? 48 : 40}
          icon="publish"
          onClick={() => window.open(publishUrl, "_blank", "noopener")}
        >
          {t("output.publish")}
        </OutputButton>
      ) : null}
    </>
  );
  return (
    <OutputDialog
      open
      title={t("output.exportedTitle")}
      onClose={onDismiss}
      width={520}
      raised
      doneLabel={t("common.done")}
      doneVariant="primary"
      testId="export-flow-done"
      footer={
        isPhone ? (
          // St-M-Exported: Descarcă and Publică share a row, "Toate exporturile" sits below.
          <div className="flex flex-col items-center gap-3">
            <div className="flex w-full gap-2 [&>*]:flex-1">{fileActions}</div>
            <OutputButton variant="ghost" height={36} onClick={onShowAll ?? onDismiss}>
              {t("output.allExports")}
            </OutputButton>
          </div>
        ) : (
          <>
            <OutputButton variant="ghost" onClick={onShowAll ?? onDismiss}>
              {t("output.allExports")}
            </OutputButton>
            {fileActions}
          </>
        )
      }
    >
      <DoneBody
        job={job}
        fileSrc={fileSrc}
        meta={renderMetaParts(job, compositionDimensions, durationSeconds)}
      />
    </OutputDialog>
  );
}
