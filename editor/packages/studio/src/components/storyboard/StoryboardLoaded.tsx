import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StoryboardResponse } from "../../hooks/useStoryboard";
import { useViewMode } from "../../contexts/ViewModeContext";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton } from "../output/OutputButton";
import { OutputDialog, OutputIllustration } from "../output/OutputDialog";
import { OutputSegment } from "../output/OutputFields";
import { illustrationSrc } from "../ui/illustrations";
import { StoryboardDirection } from "./StoryboardDirection";
import { StoryboardGrid } from "./StoryboardGrid";
import { StoryboardScriptPanel } from "./StoryboardScriptPanel";
import { StoryboardSourceEditor, type SourceFile } from "./StoryboardSourceEditor";
import { StoryboardFrameFocus } from "./StoryboardFrameFocus";
import { StoryboardReviewGuide } from "./StoryboardReviewGuide";
import { useFrameComments } from "./useFrameComments";

type SubView = "board" | "source";

export interface StoryboardLoadedProps {
  projectId: string;
  data: StoryboardResponse;
  /** Re-fetch the manifest after a source edit is saved. */
  reload: () => void;
  /** Select a composition in the timeline (used by "Open in Preview"). */
  onSelectComposition: (path: string) => void;
}

function clampIndex(index: number, count: number): number {
  return Math.max(1, Math.min(count, index));
}

/** One card of the storyboard stage (24px radius, title row, scrolling body). */
export function StoryboardCard({
  title,
  head,
  footer,
  children,
  className = "",
}: {
  title: ReactNode;
  head?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col gap-3.5 rounded-[24px] bg-studio-surface p-4 shadow-studio ${className}`}
    >
      <div className="flex min-h-8 items-center gap-2.5">
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold leading-6">
          {title}
        </h2>
        {head}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">{children}</div>
      {footer ? <div className="flex flex-col gap-2">{footer}</div> : null}
    </section>
  );
}

/**
 * A storyboard that exists on disk (St-Output-Storyboard): Direcție on the left, the board or
 * its source in the middle and the review with feedback on the right; a frame opens in focus.
 */
// fallow-ignore-next-line complexity
export function StoryboardLoaded({
  projectId,
  data,
  reload,
  onSelectComposition,
}: StoryboardLoadedProps) {
  useLocale();
  const { setViewMode } = useViewMode();
  const [subView, setSubView] = useState<SubView>("board");
  // Read only from the sub-view handler, so a ref avoids re-rendering on every edit.
  const sourceDirtyRef = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState<SubView | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [feedbackMessageCopied, setFeedbackMessageCopied] = useState(false);
  const comments = useFrameComments(data.frames);
  // When the board refreshes off a project change (agent revised frames), the
  // agent has likely consumed the comments file too — re-check so the pending
  // state clears the moment revisions land, not on the next window focus.
  const { refreshPending } = comments;
  useEffect(() => {
    void refreshPending();
  }, [data.signature, refreshPending]);
  useEffect(() => {
    if (comments.draftCount > 0) setFeedbackMessageCopied(false);
  }, [comments.draftCount]);

  const saveFeedback = async () => {
    const saved = await comments.submit();
    if (saved) setFeedbackMessageCopied(false);
  };
  const sourceFiles = useMemo<SourceFile[]>(() => {
    const files: SourceFile[] = [{ path: data.path, label: data.path }];
    if (data.script?.exists) files.push({ path: data.script.path, label: data.script.path });
    return files;
    // Depend on the stable fields, not the `data.script` object — every reload()
    // produces a fresh object and would needlessly re-create this array.
  }, [data.path, data.script?.path, data.script?.exists]);

  // Leaving the source editor drops its in-memory buffer; confirm when it's dirty.
  const changeSubView = (next: SubView) => {
    if (next === subView) return;
    if (subView === "source" && sourceDirtyRef.current) {
      setConfirmDiscard(next);
      return;
    }
    setSubView(next);
  };

  const focusedFrame =
    focusedIndex != null ? (data.frames.find((f) => f.index === focusedIndex) ?? null) : null;

  if (focusedFrame) {
    return (
      <StoryboardFrameFocus
        key={focusedFrame.index}
        projectId={projectId}
        storyboardPath={data.path}
        frame={focusedFrame}
        frameCount={data.frames.length}
        onBack={() => setFocusedIndex(null)}
        onNavigate={(delta) =>
          setFocusedIndex(clampIndex(focusedFrame.index + delta, data.frames.length))
        }
        onSaved={reload}
        onSelectComposition={onSelectComposition}
        scriptExists={Boolean(data.script?.exists)}
        commentDraft={comments.drafts[focusedFrame.index] ?? ""}
        onCommentDraftChange={(text) => comments.setDraft(focusedFrame.index, text)}
        pendingComment={
          comments.pending?.find((entry) => entry.frame === focusedFrame.index)?.text ?? null
        }
        pendingCommentCount={comments.pending?.length ?? 0}
        commentDraftCount={comments.draftCount}
        commentsSubmitState={comments.submitState}
        commentsSubmitError={comments.submitError}
        feedbackMessageCopied={feedbackMessageCopied}
        onFeedbackMessageCopied={() => setFeedbackMessageCopied(true)}
        onSaveFeedback={() => void saveFeedback()}
        posterVersion={data.signature}
      />
    );
  }

  return (
    <div
      data-storyboard-loaded
      className="flex min-h-0 w-full min-w-0 max-w-[100vw] flex-1 flex-col gap-3 overflow-auto bg-studio-bg p-3 text-studio-text lg:flex-row lg:overflow-hidden"
    >
      <StoryboardCard
        title={t("story.direction")}
        className="lg:w-[312px] lg:flex-none"
        footer={
          <OutputButton className="w-full" onClick={() => setViewMode("timeline")}>
            {t("story.openInPreview")}
          </OutputButton>
        }
      >
        <StoryboardDirection globals={data.globals} frameCount={data.frames.length} />
      </StoryboardCard>

      <StoryboardCard
        title={t("story.title")}
        className="min-h-[480px] lg:min-h-0 lg:flex-1"
        head={
          <OutputSegment
            label={t("story.viewAria")}
            options={[
              { value: "board", label: t("story.board") },
              { value: "source", label: t("story.source") },
            ]}
            value={subView}
            onChange={changeSubView}
            height={32}
            fontSize={12}
            padX={14}
            full={false}
          />
        }
      >
        {subView === "board" ? (
          <>
            <StoryboardWarnings
              warnings={data.warnings}
              onOpenSource={() => changeSubView("source")}
            />
            <StoryboardGrid
              projectId={projectId}
              frames={data.frames}
              onOpenFrame={setFocusedIndex}
              commentDrafts={comments.drafts}
              onCommentDraftChange={comments.setDraft}
              pendingComments={comments.pending}
              posterVersion={data.signature}
            />
            {data.script && <StoryboardScriptPanel script={data.script} />}
          </>
        ) : (
          <StoryboardSourceEditor
            files={sourceFiles}
            onSaved={reload}
            onDirtyChange={(dirty) => {
              sourceDirtyRef.current = dirty;
            }}
          />
        )}
      </StoryboardCard>

      {/* Bottom padding keeps the actions clear of the Ana și Radu launcher. */}
      <StoryboardCard title={t("story.review")} className="lg:w-[340px] lg:flex-none lg:pb-[84px]">
        <StoryboardReviewGuide
          frames={data.frames}
          drafts={comments.drafts}
          draftCount={comments.draftCount}
          pendingCount={comments.pending?.length ?? 0}
          submitState={comments.submitState}
          submitError={comments.submitError}
          onSaveFeedback={() => void saveFeedback()}
          onFeedbackMessageCopied={() => setFeedbackMessageCopied(true)}
        />
      </StoryboardCard>

      {/* St-Output-StoryboardDiscard */}
      <OutputDialog
        open={confirmDiscard !== null}
        title={t("story.discardSource")}
        onClose={() => setConfirmDiscard(null)}
        width={420}
        footer={
          <>
            <OutputButton onClick={() => setConfirmDiscard(null)}>{t("story.cancel")}</OutputButton>
            <OutputButton
              variant="dangerFill"
              onClick={() => {
                if (confirmDiscard) setSubView(confirmDiscard);
                sourceDirtyRef.current = false;
                setConfirmDiscard(null);
              }}
            >
              {t("story.discard")}
            </OutputButton>
          </>
        }
      >
        <OutputIllustration src={illustrationSrc("delete")} size={132} caption={data.path} />
      </OutputDialog>
    </div>
  );
}

function StoryboardWarnings({
  warnings,
  onOpenSource,
}: {
  warnings: StoryboardResponse["warnings"];
  onOpenSource: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <details className="rounded-[14px] bg-[var(--st-warn-bg)] px-3 py-2.5 text-xs text-studio-text">
      <summary className="cursor-pointer font-semibold text-[var(--st-warn)]">
        {t("story.warnings", { n: warnings.length })}
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {warnings.map((warning, index) => (
          <li key={`${warning.line ?? "unknown"}-${index}`}>
            {warning.line
              ? t("story.warningLine", { line: warning.line, message: warning.message })
              : warning.message}
          </li>
        ))}
      </ul>
      <OutputButton height={32} padX={12} fontSize={12} className="mt-2" onClick={onOpenSource}>
        {t("story.openSource")}
      </OutputButton>
    </details>
  );
}
