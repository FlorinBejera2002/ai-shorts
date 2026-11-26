// "Revizuire" (St-Output-StoryboardReview*, right card): the stage badge and title, frame status
// counts, the three hand-off steps, the frame comments and the actions that reach Ana și Radu.
import type { StoryboardFrameView } from "../../hooks/useStoryboard";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { OutputButton } from "../output/OutputButton";
import { OutputSection } from "../output/OutputFields";
import {
  AgentChatMessageButton,
  APPLY_STORYBOARD_FEEDBACK_MESSAGE,
} from "./AgentChatMessageButton";
import {
  FRAME_CHIP_CLASS,
  FRAME_STATUS_META,
  FRAME_STATUS_ORDER,
  frameStatusLabel,
} from "./frameStatus";
import {
  deriveStoryboardHandoffStep,
  deriveStoryboardReviewStage,
  type StoryboardHandoffStep,
  type StoryboardReviewStage,
} from "./storyboardReviewStage";
import type { CommentsSubmitState } from "./useFrameComments";

const STAGE: Record<
  StoryboardReviewStage,
  {
    badge: MessageKey;
    title: MessageKey;
    tone: "ok" | "muted";
    approve?: MessageKey;
    message?: string;
  }
> = {
  empty: { badge: "story.stageEmpty", title: "story.noFrames", tone: "muted" },
  "plan-review": {
    badge: "story.stageReady",
    title: "story.titlePlan",
    tone: "ok",
    approve: "story.approvePlan",
    message: "Approve this storyboard plan and continue to visual sketches.",
  },
  "sketch-in-progress": {
    badge: "story.stageBuilding",
    title: "story.titleSketching",
    tone: "muted",
  },
  "sketch-review": {
    badge: "story.stageReady",
    title: "story.titleSketches",
    tone: "ok",
    approve: "story.approveSketches",
    message: "Approve these storyboard sketches and continue to animation.",
  },
  "animation-in-progress": {
    badge: "story.stageBuilding",
    title: "story.titleAnimating",
    tone: "muted",
  },
  "final-review": {
    badge: "story.stageReady",
    title: "story.titleFinal",
    tone: "ok",
    approve: "story.approveFinal",
    message: "Approve this final storyboard review and continue to rendering.",
  },
};

const STEPS: MessageKey[] = ["story.stepReview", "story.stepSave", "story.stepReply"];

export interface StoryboardReviewGuideProps {
  frames: StoryboardFrameView[];
  drafts: Record<number, string>;
  draftCount: number;
  pendingCount: number;
  submitState: CommentsSubmitState;
  submitError: string | null;
  onSaveFeedback: () => void;
  onFeedbackMessageCopied: () => void;
}

// The label folds six workflow states into three progress formats.
// fallow-ignore-next-line complexity
function progressLabel(summary: ReturnType<typeof deriveStoryboardReviewStage>): string {
  const total = summary.frameCount;
  if (summary.stage === "sketch-in-progress" || summary.stage === "sketch-review") {
    return t("story.progressSketches", { ready: total - summary.counts.outline, total });
  }
  if (summary.stage === "animation-in-progress" || summary.stage === "final-review") {
    return t("story.progressAnimations", { ready: summary.counts.animated, total });
  }
  return t("story.progressPlan", { total });
}

function ReviewSteps({ current }: { current: StoryboardHandoffStep }) {
  return (
    <OutputSection title={t("story.steps")}>
      <ol className="flex flex-col gap-2.5" aria-label={t("story.steps")}>
        {STEPS.map((key, index) => {
          const number = (index + 1) as StoryboardHandoffStep;
          const active = number === current;
          return (
            <li
              key={key}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-2.5 text-[13px] font-medium"
            >
              <span
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                  active
                    ? "bg-[var(--st-sel)] text-[var(--st-on-sel)]"
                    : "bg-[var(--st-sub)] text-studio-text"
                }`}
              >
                {number < current ? "✓" : number}
              </span>
              {t(key)}
            </li>
          );
        })}
      </ol>
    </OutputSection>
  );
}

function CommentList({ drafts }: { drafts: Record<number, string> }) {
  const entries = Object.entries(drafts).filter(([, text]) => text.trim().length > 0);
  return (
    <OutputSection title={t("story.comments")}>
      {entries.length === 0 ? (
        <span className="text-xs font-semibold text-[var(--st-t2)]">{t("story.noComments")}</span>
      ) : (
        entries.map(([frame, text]) => (
          <div
            key={frame}
            className="rounded-[14px] bg-studio-surface p-2.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--st-bd)] [overflow-wrap:anywhere]"
          >
            {t("story.commentLine", { n: frame, text })}
          </div>
        ))
      )}
    </OutputSection>
  );
}

function ReviewHeader({ summary }: { summary: ReturnType<typeof deriveStoryboardReviewStage> }) {
  const stage = STAGE[summary.stage];
  return (
    <div className="flex flex-col items-start gap-2.5">
      <span
        className={`${FRAME_CHIP_CLASS} h-6 ${
          stage.tone === "ok"
            ? "bg-[var(--st-ok-bg)] text-[var(--st-ok)]"
            : "bg-[var(--st-sub)] text-[var(--st-t2)]"
        }`}
      >
        {t(stage.badge)}
      </span>
      <b className="font-display text-base font-semibold leading-[22px]">{t(stage.title)}</b>
      {summary.frameCount > 0 ? (
        <>
          <span className="text-xs font-medium text-[var(--st-t2)]">{progressLabel(summary)}</span>
          <div className="flex flex-wrap gap-1.5">
            {FRAME_STATUS_ORDER.map((status) => (
              <span
                key={status}
                className={`${FRAME_CHIP_CLASS} ${FRAME_STATUS_META[status].chipClass}`}
              >
                {summary.counts[status]} {frameStatusLabel(status)}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FeedbackStatusNotice({
  draftCount,
  pendingCount,
}: {
  draftCount: number;
  pendingCount: number;
}) {
  if (draftCount === 0 && pendingCount === 0) return null;
  const ready = pendingCount > 0 && draftCount === 0;
  return (
    <span
      role="status"
      className={`text-xs font-semibold ${ready ? "text-[var(--st-ok)]" : "text-[var(--st-t2)]"}`}
    >
      {draftCount > 0 ? t("story.feedbackReady") : t("story.feedbackSaved")}
    </span>
  );
}

function ReviewActions({
  stage,
  draftCount,
  pendingCount,
  submitState,
  onSaveFeedback,
  onFeedbackMessageCopied,
}: {
  stage: (typeof STAGE)[StoryboardReviewStage];
  draftCount: number;
  pendingCount: number;
  submitState: CommentsSubmitState;
  onSaveFeedback: () => void;
  onFeedbackMessageCopied: () => void;
}) {
  return (
    <div className="mt-auto flex flex-col gap-2">
      {draftCount > 0 ? (
        <OutputButton
          className="w-full"
          disabled={submitState === "saving"}
          onClick={onSaveFeedback}
        >
          {submitState === "saving"
            ? t("story.saving")
            : `${t("story.saveFeedback")} (${draftCount})`}
        </OutputButton>
      ) : null}
      {stage.approve && stage.message && draftCount === 0 && pendingCount === 0 ? (
        <AgentChatMessageButton message={stage.message} label={t(stage.approve)} stretch />
      ) : null}
      {pendingCount > 0 ? (
        <AgentChatMessageButton
          message={APPLY_STORYBOARD_FEEDBACK_MESSAGE}
          contextLabel={t("story.frameContext", { n: pendingCount })}
          onCopied={onFeedbackMessageCopied}
          stretch
        />
      ) : null}
    </div>
  );
}

/** Stage-aware review card plus the explicit Studio → agent hand-off. */
export function StoryboardReviewGuide({
  frames,
  drafts,
  draftCount,
  pendingCount,
  submitState,
  submitError,
  onSaveFeedback,
  onFeedbackMessageCopied,
}: StoryboardReviewGuideProps) {
  useLocale();
  const summary = deriveStoryboardReviewStage(frames);
  const step = deriveStoryboardHandoffStep(draftCount, pendingCount);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <ReviewHeader summary={summary} />
      {summary.frameCount > 0 ? <ReviewSteps current={step} /> : null}
      <CommentList drafts={drafts} />
      <FeedbackStatusNotice draftCount={draftCount} pendingCount={pendingCount} />
      {submitError ? (
        <span role="alert" className="text-xs font-semibold text-[var(--st-danger)]">
          {t("story.saveFailed", { error: submitError })}
        </span>
      ) : null}
      <ReviewActions
        stage={STAGE[summary.stage]}
        draftCount={draftCount}
        pendingCount={pendingCount}
        submitState={submitState}
        onSaveFeedback={onSaveFeedback}
        onFeedbackMessageCopied={onFeedbackMessageCopied}
      />
    </div>
  );
}
