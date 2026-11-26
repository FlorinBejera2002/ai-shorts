import { memo, useState, useCallback, useRef, useEffect } from "react";
import { trackStudioFeedbackShown, trackStudioFeedbackDismissed } from "../../telemetry/events";
import {
  subscribeToFeedbackRequests,
  markFeedbackAnswered,
  markFeedbackDismissed,
  followUpFor,
  isProblemReason,
  type FeedbackRequest,
  type FollowUpQuestion,
} from "./feedbackTrigger";
import { projectProvenance } from "./projectProvenance";
import { createFeedbackReport } from "./feedbackReport";
import { feedbackText } from "./feedbackCopy";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton, OutputIconButton } from "../output/OutputButton";
import { OutputInput } from "../output/OutputFields";
import { OutputIcon } from "../output/OutputIcon";

/** A failed render is its own question; nothing is rotated in front of it. */
const FAILURE_FOLLOW_UP: FollowUpQuestion = {
  id: "failure",
  prompt: "That export failed.",
  placeholder: "What were you exporting?",
  presets: [
    { label: "Happens every time", hint: "Every export of this project fails this way" },
    { label: "First time", hint: "Exports normally work for me" },
    { label: "Long composition", hint: "Over a minute, or a lot of scenes" },
    { label: "Big media files", hint: "Large video or image assets in the project" },
    { label: "Has audio", hint: "The composition includes voiceover, music or sound" },
    { label: "Embedded video", hint: "One or more video clips inside the composition" },
  ],
};

/**
 * The crash screen ask. "What were you doing" beats "what went wrong": the
 * user cannot see the stack trace, but they know exactly what they touched,
 * and that is the half the crash report is missing.
 */
const CRASH_FOLLOW_UP: FollowUpQuestion = {
  id: "crash",
  prompt: "Studio crashed. What were you doing?",
  placeholder: "The last thing you touched",
  presets: [
    { label: "Editing the timeline", hint: "Dragging, trimming or splitting clips" },
    { label: "Playing the preview", hint: "Scrubbing or playing back the composition" },
    { label: "Adding media", hint: "Importing video, images or audio" },
    { label: "Editing properties", hint: "Changing styles, transforms or keyframes" },
    { label: "Exporting", hint: "Starting or watching a render" },
    { label: "Just opened it", hint: "It broke before I did anything" },
  ],
};

/** Long enough to read the render result first; short enough to stay polite. */
const AUTO_DISMISS_MS = 30_000;
/** Matches the .hf-toast-exit animation so the node leaves as it finishes. */
const EXIT_MS = 160;

const RATINGS = Array.from({ length: 11 }, (_, n) => n);

type Step = "rating" | "comment" | "thanks";

/**
 * The Studio feedback prompt. Shown by `feedbackTrigger` after a render
 * finishes or fails — never on a timer, so the user always knows what they are
 * being asked about.
 *
 * A failed render skips the 0-10 scale: scoring an export you never got is a
 * question with no useful answer, and the free-text reply is the whole point.
 */
// fallow-ignore-next-line complexity
export const StudioFeedbackCard = memo(function StudioFeedbackCard() {
  useLocale();
  const [request, setRequest] = useState<FeedbackRequest | null>(null);
  const [step, setStep] = useState<Step>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpQuestion>(FAILURE_FOLLOW_UP);
  const [comment, setComment] = useState("");
  const [report, setReport] = useState("");
  const [exiting, setExiting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read inside close(), which must not re-subscribe every keystroke.
  const stateRef = useRef({ request, rating, step });
  stateRef.current = { request, rating, step };

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(
    (via: "close" | "escape" | "timeout" | "sent") => {
      const { request: req, rating: picked, step: at } = stateRef.current;
      if (!req) return;
      clearTimer();
      if (via === "sent") {
        markFeedbackAnswered();
      } else {
        markFeedbackDismissed();
        trackStudioFeedbackDismissed({
          reason: req.reason,
          render_id: req.renderId,
          via,
          had_rating: picked !== null || at === "comment",
        });
      }
      setExiting(true);
      setTimeout(() => {
        setRequest(null);
        setExiting(false);
        setRating(null);
        setComment("");
        setStep("rating");
      }, EXIT_MS);
    },
    [clearTimer],
  );

  useEffect(
    () =>
      subscribeToFeedbackRequests((next) => {
        setRequest(next);
        setRating(null);
        setComment("");
        setReport("");
        setFollowUp(next.reason === "crash" ? CRASH_FOLLOW_UP : FAILURE_FOLLOW_UP);
        // A crash or a failed render has nothing to score, so those open
        // straight at the ask instead of demanding a number first.
        setStep(isProblemReason(next.reason) ? "comment" : "rating");
        trackStudioFeedbackShown({ reason: next.reason, render_id: next.renderId });
      }),
    [],
  );

  // Auto-dismiss only while the prompt is still untouched — once the user
  // starts typing or picks a score, the card is theirs until they close it.
  useEffect(() => {
    if (!request || step === "thanks" || rating !== null || comment !== "") return;
    timerRef.current = setTimeout(() => close("timeout"), AUTO_DISMISS_MS);
    return clearTimer;
  }, [request, step, rating, comment, close, clearTimer]);

  useEffect(() => {
    if (step === "comment") inputRef.current?.focus();
  }, [step]);

  /** `preset` is the tapped chip's text; absent means the field was typed in. */
  const submit = useCallback(
    (preset?: string) => {
      const req = stateRef.current.request;
      if (!req) return;
      const text = (preset ?? comment).trim();
      // Nothing to send yet: a failure prompt with no words is just a dismiss.
      if (rating === null && text === "") return close("close");
      setReport(
        createFeedbackReport({
          reason: req.reason,
          render_id: req.renderId,
          // Which follow-up this comment answers. Without it, "nothing" against
          // "what would you cut?" and "nothing" against "what should we fix?" are
          // the same row, and neither means anything.
          question: followUp.id,
          // Tapped chips cluster into countable buckets; typed answers do not.
          // Mixing them would make a chip's popularity look like a written theme.
          answer_kind: preset === undefined ? "typed" : "preset",
          // Provenance first so a producer's own context wins on a key clash.
          context: { ...projectProvenance(), ...req.context },
          ...(rating === null ? {} : { rating }),
          ...(text ? { comment: text } : {}),
          ...(req.detail ? { detail: req.detail } : {}),
        }),
      );
      clearTimer();
      setStep("thanks");
    },
    [rating, comment, followUp.id, close, clearTimer],
  );

  const pickRating = useCallback((n: number) => {
    setRating(n);
    setFollowUp(followUpFor(n));
    setStep("comment");
  }, []);

  if (!request) return null;

  const failed = isProblemReason(request.reason);
  // The rating question is the CLI's, word for word: Studio and CLI ratings only sit on one
  // axis if they ask the same thing. `reason` records the moment, not a reworded prompt.
  const title =
    step === "thanks"
      ? t("feedback.reportReady")
      : step === "rating"
        ? t("feedback.ratingTitle")
        : feedbackText(followUp.prompt);

  return (
    <div
      role="dialog"
      aria-label={t("feedback.dialogLabel")}
      className={`motion-reduce:animate-none ${exiting ? "hf-toast-exit" : "hf-toast-enter"}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close("escape");
      }}
    >
      {/* St-Output-Feedback: a 340px popover card, radius 20, title and a close button. */}
      <div className="flex w-[min(340px,calc(100vw-32px))] flex-col gap-3 rounded-[20px] bg-studio-surface p-4 text-studio-text shadow-[var(--st-sh),0_16px_40px_rgba(21,32,53,0.16)]">
        <div className="flex items-start gap-2">
          <b className="min-w-0 flex-1 text-sm font-semibold leading-5">{title}</b>
          <OutputIconButton
            icon="close"
            label={t("feedback.close")}
            size={28}
            iconSize={14}
            onClick={() => close("close")}
          />
        </div>

        {/* The failure the user already saw, quoted back so the report carries it. */}
        {failed && request.detail && step !== "thanks" && (
          <p className="line-clamp-2 text-[11px] leading-4 text-[var(--st-danger)]">
            {request.detail}
          </p>
        )}

        {step === "rating" && <RatingScale rating={rating} onPick={pickRating} />}

        {step === "comment" && (
          <>
            {/* One tap is the whole answer and sends immediately; the field covers the rest. */}
            <div className="flex flex-wrap gap-1.5">
              {followUp.presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => submit(preset.label)}
                  title={feedbackText(preset.hint)}
                  aria-label={`${feedbackText(preset.label)}. ${feedbackText(preset.hint)}`}
                  className="h-8 rounded-[14px] bg-studio-surface px-3 text-xs font-semibold text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none transition-colors hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] active:bg-[var(--st-sel)] active:text-[var(--st-on-sel)]"
                >
                  {feedbackText(preset.label)}
                </button>
              ))}
            </div>
            <OutputInput
              ref={inputRef}
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder={feedbackText(followUp.placeholder)}
              aria-label={feedbackText(followUp.prompt)}
              maxLength={500}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <OutputButton variant="ghost" height={36} onClick={() => close("close")}>
            {t("feedback.close")}
          </OutputButton>
          {step === "thanks" ? (
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(report)}`}
              download="sneepcut-feedback.json"
              onClick={() => close("sent")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--st-btn)] px-4 text-[13px] font-semibold text-[var(--st-on-btn)] outline-none hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]"
            >
              <OutputIcon name="download" size={16} />
              {t("feedback.download")}
            </a>
          ) : (
            <OutputButton
              variant="primary"
              height={36}
              disabled={step === "rating"}
              onClick={() => submit()}
            >
              {t("feedback.send")}
            </OutputButton>
          )}
        </div>
      </div>
    </div>
  );
});

/** 0 to 10 as native radios (arrow keys, grouping and labels for free), drawn as 32px tiles. */
function RatingScale({ rating, onPick }: { rating: number | null; onPick: (n: number) => void }) {
  return (
    <>
      <fieldset className="grid grid-cols-11 gap-1">
        <legend className="sr-only">{t("feedback.ratingLegend")}</legend>
        {RATINGS.map((n) => (
          <label
            key={n}
            className="flex h-8 cursor-pointer items-center justify-center rounded-[10px] bg-studio-surface text-xs font-semibold tabular-nums text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] transition-colors hover:bg-[var(--st-sub)] has-[:checked]:bg-[var(--st-sel)] has-[:checked]:text-[var(--st-on-sel)] has-[:checked]:shadow-none has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--st-btn)]"
          >
            <input
              type="radio"
              name="hf-studio-feedback-rating"
              value={n}
              checked={rating === n}
              onChange={() => onPick(n)}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </fieldset>
      <div className="flex justify-between text-[11px] font-medium text-[var(--st-t2)]">
        <span>{t("feedback.notLikely")}</span>
        <span>{t("feedback.extremelyLikely")}</span>
      </div>
    </>
  );
}
