import { useLocale, t } from "../../i18n/translate";
import { useViewMode } from "../../contexts/ViewModeContext";
import type { StoryboardFrameView } from "../../hooks/useStoryboard";
import { OutputButton, OutputIconButton } from "../output/OutputButton";
import { FramePoster, posterTime } from "./FramePoster";
import {
  AgentChatMessageButton,
  APPLY_STORYBOARD_FEEDBACK_MESSAGE,
} from "./AgentChatMessageButton";
import { FRAME_CHIP_CLASS, FRAME_STATUS_META, frameStatusLabel } from "./frameStatus";
import type { CommentsSubmitState } from "./useFrameComments";
import { useFrameVoiceoverDraft } from "./useFrameVoiceoverDraft";
import { useFrameFocusKeys } from "./useFrameFocusKeys";

export interface StoryboardFrameFocusProps {
  projectId: string;
  /** Path to STORYBOARD.md (edits are written here). */
  storyboardPath: string;
  frame: StoryboardFrameView;
  frameCount: number;
  onBack: () => void;
  onNavigate: (delta: number) => void;
  /** Re-parse the manifest after an edit is saved. */
  onSaved: () => void;
  /** Select a composition in the timeline (sets active comp + editing file + sidebar highlight). */
  onSelectComposition: (path: string) => void;
  /** Whether SCRIPT.md exists and owns final narration/TTS. */
  scriptExists: boolean;
  /** Shared board draft for this frame, preserved when entering/leaving focus. */
  commentDraft: string;
  onCommentDraftChange: (text: string) => void;
  pendingComment: string | null;
  pendingCommentCount: number;
  commentDraftCount: number;
  commentsSubmitState: CommentsSubmitState;
  commentsSubmitError: string | null;
  feedbackMessageCopied: boolean;
  onFeedbackMessageCopied: () => void;
  onSaveFeedback: () => void;
  /** Project signature the board was loaded with (busts the poster cache). */
  posterVersion?: string;
}

const TEXTAREA_CLASS =
  "block h-24 w-full resize-y rounded-[14px] border-0 bg-studio-surface px-3 py-2.5 text-[13px] leading-[18px] text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none placeholder:text-[var(--st-t3)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)]";

/**
 * Full-area focus on a single frame: large poster, editable voiceover guide,
 * review feedback, full narrative, and a jump into the live preview. Edits
 * are written back to STORYBOARD.md in place (markdown stays canonical).
 *
 * Mounted with a `key` per frame, so `draft` initializes from the frame and a
 * save-triggered reload never clobbers in-progress typing.
 */
// fallow-ignore-next-line complexity
export function StoryboardFrameFocus({
  projectId,
  storyboardPath,
  frame,
  frameCount,
  onBack,
  onNavigate,
  onSaved,
  onSelectComposition,
  scriptExists,
  commentDraft,
  onCommentDraftChange,
  pendingComment,
  pendingCommentCount,
  commentDraftCount,
  commentsSubmitState,
  commentsSubmitError,
  feedbackMessageCopied,
  onFeedbackMessageCopied,
  onSaveFeedback,
  posterVersion,
}: StoryboardFrameFocusProps) {
  useLocale();
  const { setViewMode } = useViewMode();
  const title = frame.title ?? t("story.frameN", { n: frame.index });
  const canOpenPreview = frame.status !== "outline" && frame.srcExists && Boolean(frame.src);

  const voiceover = useFrameVoiceoverDraft({
    storyboardPath,
    frameIndex: frame.index,
    initialVoiceover: frame.voiceover ?? "",
    onSaved,
  });

  const handleBack = () => {
    if (voiceover.confirmLeave()) onBack();
  };
  const handleNavigate = (delta: number) => {
    if (voiceover.confirmLeave()) onNavigate(delta);
  };
  useFrameFocusKeys({
    frameIndex: frame.index,
    frameCount,
    onBack: handleBack,
    onNavigate: handleNavigate,
  });

  const openInPreview = () => {
    if (!setViewMode("timeline")) return;
    if (frame.src) onSelectComposition(frame.src);
  };

  return (
    <div
      data-storyboard-focus={frame.index}
      className="flex min-h-0 w-full min-w-0 max-w-[100vw] flex-1 flex-col gap-3 overflow-auto bg-studio-bg p-3 text-studio-text lg:flex-row lg:overflow-hidden"
    >
      <section className="flex min-h-[360px] min-w-0 flex-col gap-3.5 rounded-[24px] bg-studio-surface p-4 shadow-studio lg:min-h-0 lg:flex-1">
        <div className="flex items-center gap-2">
          <OutputIconButton
            icon="back"
            label={t("story.backToBoard")}
            size={36}
            iconSize={18}
            onClick={handleBack}
          />
          <b className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {t("story.frameN", { n: frame.number ?? frame.index })} · {title}
          </b>
          <OutputIconButton
            icon="back"
            label={t("story.prevFrame")}
            size={36}
            iconSize={18}
            disabled={frame.index <= 1}
            onClick={() => handleNavigate(-1)}
          />
          <OutputIconButton
            icon="chevronRight"
            label={t("story.nextFrame")}
            size={36}
            iconSize={18}
            disabled={frame.index >= frameCount}
            onClick={() => handleNavigate(1)}
          />
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-[var(--st-sub)]">
          {canOpenPreview && frame.src ? (
            <FramePoster
              projectId={projectId}
              src={frame.src}
              seconds={posterTime(frame)}
              title={title}
              surface="hero"
              posterVersion={posterVersion}
            />
          ) : (
            <FramePlan frame={frame} />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ReadOnlyStatus status={frame.status} />
          {canOpenPreview ? (
            <OutputButton height={36} onClick={openInPreview}>
              {t("story.openInPreview")}
            </OutputButton>
          ) : null}
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-5 rounded-[24px] bg-studio-surface p-4 shadow-studio lg:w-[340px] lg:flex-none lg:overflow-auto">
        <h2 className="font-display text-[17px] font-semibold leading-6">{t("story.voiceover")}</h2>
        <VoiceoverEditor
          draft={voiceover.draft}
          onDraftChange={voiceover.setDraft}
          dirty={voiceover.dirty}
          busy={voiceover.busy}
          error={voiceover.error}
          scriptExists={scriptExists}
          onSave={() => void voiceover.saveVoiceover()}
        />
        <FrameFeedbackSection
          title={title}
          commentDraft={commentDraft}
          onCommentDraftChange={onCommentDraftChange}
          pendingComment={pendingComment}
          pendingCommentCount={pendingCommentCount}
          commentDraftCount={commentDraftCount}
          commentsSubmitState={commentsSubmitState}
          commentsSubmitError={commentsSubmitError}
          feedbackMessageCopied={feedbackMessageCopied}
          onFeedbackMessageCopied={onFeedbackMessageCopied}
          onSaveFeedback={onSaveFeedback}
        />

        {frame.narrative && (
          <section className="flex flex-col gap-2.5">
            <b className="text-[13px] font-semibold">{t("story.narrative")}</b>
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-[var(--st-t2)]">
              {frame.narrative}
            </p>
          </section>
        )}
        {frame.duration || frame.transitionIn ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--st-t2)]">
            {frame.duration && <span>{t("story.duration", { value: frame.duration })}</span>}
            {frame.transitionIn && (
              <span>{t("story.transition", { value: frame.transitionIn })}</span>
            )}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function VoiceoverEditor({
  draft,
  onDraftChange,
  dirty,
  busy,
  error,
  scriptExists,
  onSave,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  dirty: boolean;
  busy: boolean;
  error: string | null;
  scriptExists: boolean;
  onSave: () => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        rows={4}
        aria-label={t("story.voiceover")}
        title={scriptExists ? "SCRIPT.md" : undefined}
        placeholder={t("story.voicePlaceholder")}
        className={TEXTAREA_CLASS}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex h-6 items-center rounded-lg px-2 text-xs font-semibold ${
            dirty
              ? "bg-[var(--st-warn-bg)] text-[var(--st-warn)]"
              : "bg-[var(--st-ok-bg)] text-[var(--st-ok)]"
          }`}
        >
          {dirty ? t("story.unsaved") : t("story.saved")}
        </span>
        <OutputButton
          variant={dirty ? "primary" : "secondary"}
          height={36}
          padX={14}
          fontSize={12}
          disabled={!dirty || busy}
          onClick={onSave}
        >
          {busy ? t("story.saving") : t("story.saveVoice")}
        </OutputButton>
      </div>
      {error && (
        <span role="alert" className="text-xs font-semibold text-[var(--st-danger)]">
          {error}
        </span>
      )}
    </section>
  );
}

function FrameFeedbackSection({
  title,
  commentDraft,
  onCommentDraftChange,
  pendingComment,
  pendingCommentCount,
  commentDraftCount,
  commentsSubmitState,
  commentsSubmitError,
  feedbackMessageCopied,
  onFeedbackMessageCopied,
  onSaveFeedback,
}: {
  title: string;
  commentDraft: string;
  onCommentDraftChange: (text: string) => void;
  pendingComment: string | null;
  pendingCommentCount: number;
  commentDraftCount: number;
  commentsSubmitState: CommentsSubmitState;
  commentsSubmitError: string | null;
  feedbackMessageCopied: boolean;
  onFeedbackMessageCopied: () => void;
  onSaveFeedback: () => void;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <b className="text-[13px] font-semibold">{t("story.frameFeedback")}</b>
      <textarea
        value={commentDraft}
        onChange={(e) => onCommentDraftChange(e.target.value)}
        rows={3}
        placeholder={t("story.frameFeedbackPlaceholder")}
        aria-label={t("story.commentAria", { title })}
        className="block h-20 w-full resize-y rounded-[14px] border-0 bg-studio-surface px-3 py-2.5 text-[13px] leading-[18px] text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none placeholder:text-[var(--st-t3)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)]"
      />
      {pendingComment && (
        <span className="text-xs font-semibold [overflow-wrap:anywhere]">
          {t("story.pending", { text: pendingComment })}
        </span>
      )}
      {commentsSubmitError && (
        <span role="alert" className="text-xs font-semibold text-[var(--st-danger)]">
          {t("story.saveFailed", { error: commentsSubmitError })}
        </span>
      )}
      {commentDraftCount > 0 ? (
        <OutputButton
          className="w-full"
          disabled={commentsSubmitState === "saving"}
          onClick={onSaveFeedback}
        >
          {commentsSubmitState === "saving"
            ? t("story.saving")
            : `${t("story.saveFeedback")} (${commentDraftCount})`}
        </OutputButton>
      ) : null}
      {pendingCommentCount > 0 ? (
        <AgentChatMessageButton
          message={APPLY_STORYBOARD_FEEDBACK_MESSAGE}
          contextLabel={t("story.frameContext", { n: pendingCommentCount })}
          onCopied={onFeedbackMessageCopied}
          stretch
        />
      ) : null}
      {feedbackMessageCopied && pendingCommentCount > 0 ? (
        <span role="status" className="text-xs font-semibold text-[var(--st-ok)]">
          {t("story.feedbackSaved")}
        </span>
      ) : null}
    </section>
  );
}

function ReadOnlyStatus({ status }: { status: StoryboardFrameView["status"] }) {
  const meta = FRAME_STATUS_META[status];
  return (
    <span className="flex items-center gap-2">
      <span className={`${FRAME_CHIP_CLASS} ${meta.chipClass}`}>{frameStatusLabel(status)}</span>
      <span className="text-xs text-[var(--st-t2)]">{t("story.updatedByAgent")}</span>
    </span>
  );
}

// The empty state picks copy from the frame status and whichever storyboard fields exist.
// fallow-ignore-next-line complexity
function FramePlan({ frame }: { frame: StoryboardFrameView }) {
  const title = frame.title ?? t("story.frameN", { n: frame.index });
  const isOutline = frame.status === "outline";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto p-8 text-center">
      <span className="inline-flex h-6 items-center rounded-lg bg-studio-surface px-2 text-xs font-semibold text-[var(--st-t2)]">
        {isOutline ? t("story.plannedFrame") : t("story.previewUnavailable")}
      </span>
      <b className="font-display text-xl font-semibold">{title}</b>
      {frame.scene && (
        <p className="max-w-xl text-sm leading-6 text-[var(--st-t2)]">{frame.scene}</p>
      )}
      {!isOutline ? (
        <span className="text-[13px] font-semibold text-[var(--st-t2)]">
          {frame.src ? `${t("story.fileNotFound")}: ${frame.src}` : t("story.noSource")}
        </span>
      ) : null}
    </div>
  );
}
