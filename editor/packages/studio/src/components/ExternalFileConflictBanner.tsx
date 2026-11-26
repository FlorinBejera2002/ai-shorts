// External file change (St-Conflict-*): an alert card over the editor while the preview is
// paused, a review dialog with both versions (or the recovered Studio draft) and a confirmation
// before the file on disk is overwritten.
import { useState } from "react";
import type {
  ExternalFileChangeBlockedState,
  ExternalFileChangeCoordinatorHandle,
} from "../hooks/useExternalFileChangeCoordinator";
import { t, useLocale } from "../i18n/translate";
import { copyTextToClipboard } from "../utils/clipboard";
import { OutputButton } from "./output/OutputButton";
import { OutputDialog } from "./output/OutputDialog";
import { OutputAlertCard } from "./output/OutputFields";
import { useIsPhone } from "./shell/useIsPhone";

type ConflictState = Extract<ExternalFileChangeBlockedState, { status: "conflict" }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadText(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** One version of the file: title, copy and download, and the read-only contents. */
function FileVersion({
  title,
  content,
  filename,
  compact,
}: {
  title: string;
  content: string;
  filename: string;
  compact: boolean;
}) {
  const actions = (
    <>
      <OutputButton
        height={compact ? 40 : 30}
        padX={compact ? 14 : 12}
        fontSize={compact ? 13 : 12}
        stretch={compact}
        onClick={() => void copyTextToClipboard(content)}
      >
        {t("conflict.copy")}
      </OutputButton>
      <OutputButton
        height={compact ? 40 : 30}
        padX={compact ? 14 : 12}
        fontSize={compact ? 13 : 12}
        stretch={compact}
        onClick={() => downloadText(filename, content)}
      >
        {t("conflict.download")}
      </OutputButton>
    </>
  );
  return (
    <section aria-label={title} className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold leading-5">{title}</h3>
        {compact ? null : <div className="flex gap-1.5">{actions}</div>}
      </div>
      {compact ? <div className="flex gap-2">{actions}</div> : null}
      <textarea
        readOnly
        value={content}
        aria-label={title}
        className={`w-full resize-y rounded-[14px] border-0 bg-studio-surface font-mono text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)] outline-none ${
          compact
            ? "h-[120px] p-2.5 text-[11px] leading-[1.5]"
            : "h-[260px] p-3.5 text-xs leading-[1.6]"
        }`}
      />
    </section>
  );
}

function ReviewDialog({
  title,
  versions,
  onClose,
}: {
  title: string;
  versions: { title: string; content: string; filename: string }[];
  onClose: () => void;
}) {
  const compact = useIsPhone();
  return (
    <OutputDialog
      open
      title={title}
      onClose={onClose}
      width={versions.length > 1 ? 880 : 520}
      footer={
        compact ? undefined : (
          <OutputButton variant="primary" padX={20} onClick={onClose}>
            {t("feedback.close")}
          </OutputButton>
        )
      }
    >
      <div className={`flex gap-4 ${compact ? "flex-col" : "items-stretch"}`}>
        {versions.map((version) => (
          <FileVersion key={version.filename} {...version} compact={compact} />
        ))}
      </div>
    </OutputDialog>
  );
}

function OverwriteDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <OutputDialog
      open
      title={t("conflict.overwriteTitle")}
      onClose={onCancel}
      width={440}
      doneLabel={t("conflict.cancel")}
      footer={
        <>
          <OutputButton padX={20} onClick={onCancel}>
            {t("conflict.cancel")}
          </OutputButton>
          <OutputButton variant="danger" padX={20} onClick={onConfirm}>
            {t("conflict.overwriteConfirm")}
          </OutputButton>
        </>
      }
    />
  );
}

function conflictVersions(conflict: ConflictState) {
  const path = conflict.error.filePath;
  return [
    {
      title: t("conflict.fileOnDisk"),
      content: conflict.error.currentContent ?? t("conflict.noContents"),
      filename: `${path}.external.html`,
    },
    {
      title: t("conflict.studioVersion"),
      content: conflict.error.attemptedContent,
      filename: `${path}.studio.html`,
    },
  ];
}

type FailureState = Extract<ExternalFileChangeBlockedState, { status: "failed" }>;

interface BannerState {
  conflict: ConflictState | null;
  failure: FailureState | null;
  draft: string | null;
  canOverwrite: boolean;
}

function describeBlockedState(blocked: ExternalFileChangeBlockedState): BannerState {
  const conflict = blocked.status === "conflict" ? blocked : null;
  const failure = blocked.status === "failed" ? blocked : null;
  const draft = failure?.studioContent ?? null;
  return {
    conflict,
    failure,
    draft,
    canOverwrite: conflict !== null || (failure?.recovered === true && draft !== null),
  };
}

/** Buttons of the alert card, in the order the user works through a conflict. */
function ConflictActions({
  state,
  coordinator,
  height,
  onReview,
  onOverwrite,
}: {
  state: BannerState;
  coordinator: ExternalFileChangeCoordinatorHandle;
  height: number;
  onReview: () => void;
  onOverwrite: () => void;
}) {
  const { conflict, failure, draft, canOverwrite } = state;
  return (
    <>
      {conflict || draft !== null ? (
        <OutputButton variant="primary" height={height} onClick={onReview}>
          {conflict ? t("conflict.reviewBoth") : t("conflict.reviewDraft")}
        </OutputButton>
      ) : null}
      {failure && !failure.recovered && draft !== null ? (
        <OutputButton height={height} onClick={() => void coordinator.retry()}>
          {t("conflict.retrySave")}
        </OutputButton>
      ) : null}
      <OutputButton height={height} onClick={() => void coordinator.useExternalFile()}>
        {draft !== null && !conflict ? t("conflict.discardDraft") : t("conflict.discardStudio")}
      </OutputButton>
      {canOverwrite ? (
        <OutputButton variant="danger" height={height} onClick={onOverwrite}>
          {conflict ? t("conflict.overwrite") : t("conflict.overwriteDraft")}
        </OutputButton>
      ) : null}
    </>
  );
}

/** Review dialog for whichever version set the current block offers. */
function ConflictReviewDialog({ state, onClose }: { state: BannerState; onClose: () => void }) {
  const { conflict, failure, draft } = state;
  if (conflict) {
    return (
      <ReviewDialog
        title={t("conflict.reviewBoth")}
        versions={conflictVersions(conflict)}
        onClose={onClose}
      />
    );
  }
  if (failure && draft !== null) {
    return (
      <ReviewDialog
        title={t("conflict.reviewDraft")}
        versions={[
          {
            title: t("conflict.draftTitle"),
            content: draft,
            filename: `${failure.path}.studio.html`,
          },
        ]}
        onClose={onClose}
      />
    );
  }
  return null;
}

export function ExternalFileConflictBanner({
  coordinator,
}: {
  coordinator: ExternalFileChangeCoordinatorHandle;
}) {
  useLocale();
  const isPhone = useIsPhone();
  const [reviewing, setReviewing] = useState(false);
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const blocked = coordinator.blocked;
  if (!blocked) return null;

  const state = describeBlockedState(blocked);
  const { conflict, failure } = state;

  return (
    <>
      <div
        className="fixed top-[68px] right-3 left-3 z-[94] sm:top-[84px] sm:right-auto sm:left-1/2 sm:w-[840px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2"
        title={failure ? errorMessage(failure.error) : conflict?.error.filePath}
      >
        <OutputAlertCard message={conflict ? t("conflict.changed") : t("conflict.failed")}>
          <ConflictActions
            state={state}
            coordinator={coordinator}
            height={isPhone ? 44 : 40}
            onReview={() => setReviewing(true)}
            onOverwrite={() => setConfirmingOverwrite(true)}
          />
        </OutputAlertCard>
      </div>
      {reviewing ? (
        <ConflictReviewDialog state={state} onClose={() => setReviewing(false)} />
      ) : null}
      {confirmingOverwrite ? (
        <OverwriteDialog
          onCancel={() => setConfirmingOverwrite(false)}
          onConfirm={() => {
            setConfirmingOverwrite(false);
            // The server keeps its normal backup of the current file before writing.
            void coordinator.keepStudioFile();
          }}
        />
      ) : null}
    </>
  );
}
