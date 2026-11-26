import type { StoryboardFrameView } from "../../hooks/useStoryboard";
import { FramePoster, posterTime } from "./FramePoster";
import {
  FRAME_CHIP_CLASS,
  FRAME_STATUS_META,
  frameStatusLabel,
  frameStatusTip,
} from "./frameStatus";
import { t, useLocale } from "../../i18n/translate";

export interface StoryboardFrameTileProps {
  projectId: string;
  frame: StoryboardFrameView;
  /** Open this frame in the full-area focus view. */
  onOpen: (index: number) => void;
  /** This frame's pending comment draft ("" when none). */
  commentDraft: string;
  onCommentDraftChange: (index: number, text: string) => void;
  /** A submitted comment the agent has not consumed yet (null when none). */
  pendingComment: string | null;
  /** Project signature the board was loaded with (busts the poster cache). */
  posterVersion?: string;
}

function firstLine(text: string): string {
  return (
    text
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
  );
}

function placeholderMessage(frame: StoryboardFrameView): string {
  if (frame.status === "outline") return t("story.notBuilt");
  if (frame.src && !frame.srcExists) return t("story.fileNotFound");
  return t("story.noPreview");
}

/** One frame tile (board covOutFrame): 16:9 poster, "n · title" and status, comment field. */
// fallow-ignore-next-line complexity
export function StoryboardFrameTile({
  projectId,
  frame,
  onOpen,
  commentDraft,
  onCommentDraftChange,
  pendingComment,
  posterVersion,
}: StoryboardFrameTileProps) {
  useLocale();
  const meta = FRAME_STATUS_META[frame.status];
  const renderable = frame.srcExists && frame.status !== "outline";
  const title = frame.title ?? t("story.frameN", { n: frame.index });
  const sceneLine = frame.scene ?? firstLine(frame.narrative);
  const label = frameStatusLabel(frame.status);

  return (
    <article className="flex min-w-0 flex-col gap-2" data-storyboard-frame={frame.index}>
      <button
        type="button"
        onClick={() => onOpen(frame.index)}
        title={sceneLine || undefined}
        className={`relative block aspect-video w-full overflow-hidden rounded-xl bg-[var(--st-sub)] text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${
          renderable ? "" : "shadow-[inset_0_0_0_1.5px_var(--st-sbd)]"
        }`}
      >
        {renderable && frame.src ? (
          <FramePoster
            projectId={projectId}
            src={frame.src}
            seconds={posterTime(frame)}
            title={title}
            posterVersion={posterVersion}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs font-semibold text-[var(--st-t2)]">
            {placeholderMessage(frame)}
          </span>
        )}
      </button>
      <span className="flex min-w-0 items-center justify-between gap-1.5">
        <b className="min-w-0 truncate text-xs font-semibold">
          {frame.number ?? frame.index} · {title}
        </b>
        <span
          title={frameStatusTip(frame.status)}
          aria-label={t("story.statusAria", { label })}
          className={`${FRAME_CHIP_CLASS} ${meta.chipClass}`}
        >
          {label}
        </span>
      </span>
      {frame.duration || frame.transitionIn ? (
        <span className="flex gap-3 text-[11px] text-[var(--st-t2)]">
          {frame.duration && <span>{frame.duration}</span>}
          {frame.transitionIn && <span>↘ {frame.transitionIn}</span>}
        </span>
      ) : null}
      <input
        type="text"
        value={commentDraft}
        onChange={(e) => onCommentDraftChange(frame.index, e.target.value)}
        placeholder={t("story.commentPlaceholder")}
        aria-label={t("story.commentAria", { title })}
        className="h-[34px] w-full min-w-0 rounded-xl border-0 bg-studio-surface px-2.5 text-xs text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none placeholder:text-[var(--st-t3)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)]"
      />
      {pendingComment && (
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold">
          <span className="min-w-0 truncate" title={pendingComment}>
            {t("story.pending", { text: pendingComment })}
          </span>
        </span>
      )}
    </article>
  );
}
