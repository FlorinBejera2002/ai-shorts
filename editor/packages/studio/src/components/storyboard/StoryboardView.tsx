import type { ReactNode } from "react";
import { useStoryboard } from "../../hooks/useStoryboard";
import { useProjectSignaturePoll } from "../../hooks/useProjectSignaturePoll";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton } from "../output/OutputButton";
import { OutputNotice } from "../output/OutputFields";
import { OutputIcon } from "../output/OutputIcon";
import { illustrationSrc } from "../ui/illustrations";
import { AgentChatMessageButton } from "./AgentChatMessageButton";
import { StoryboardLoaded } from "./StoryboardLoaded";

export interface StoryboardViewProps {
  projectId: string;
  /** Select a composition in the timeline (used by the frame focus "Open in Preview"). */
  onSelectComposition: (path: string) => void;
}

/**
 * Top-level storyboard stage. Replaces the timeline/preview when the view mode
 * is `storyboard`. Handles the load states here; once a storyboard exists,
 * {@link StoryboardLoaded} owns the Board ↔ Source experience.
 */
// fallow-ignore-next-line complexity
export function StoryboardView({ projectId, onSelectComposition }: StoryboardViewProps) {
  useLocale();
  const { data, loading, error, reload } = useStoryboard(projectId);
  // Keep the board current while an agent writes to the project: when the
  // project signature moves past the one `data` was loaded with, refetch. Also
  // upgrades the empty state the moment STORYBOARD.md lands on disk.
  useProjectSignaturePoll(projectId, data?.signature, reload);

  if (loading) return <LoadingState />;
  if (error) {
    return (
      <StoryboardFrame>
        <div className="mx-auto flex w-full max-w-md flex-col gap-3" title={error}>
          <OutputNotice>{t("story.loadFailed")}</OutputNotice>
          <OutputButton variant="primary" icon="refresh" className="w-full" onClick={reload}>
            {t("story.retry")}
          </OutputButton>
        </div>
      </StoryboardFrame>
    );
  }
  if (!data) return <StoryboardFrame>{null}</StoryboardFrame>;
  if (!data.exists) {
    return (
      <StoryboardFrame>
        <EmptyState path={data.path} />
      </StoryboardFrame>
    );
  }

  return (
    <StoryboardLoaded
      projectId={projectId}
      data={data}
      reload={reload}
      onSelectComposition={onSelectComposition}
    />
  );
}

/** The storyboard stage: cards on the Studio canvas. */
function StoryboardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 bg-studio-bg p-3 text-studio-text">
      <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-auto rounded-[24px] bg-studio-surface p-6 shadow-studio">
        {children}
      </section>
    </div>
  );
}

/** St-Output-StoryboardLoading: title and six frame skeletons. */
function LoadingState() {
  return (
    <div className="flex min-h-0 flex-1 bg-studio-bg p-3 text-studio-text">
      <section className="flex min-h-0 flex-1 flex-col gap-4 rounded-[24px] bg-studio-surface p-4 shadow-studio">
        <b role="status" className="text-[13px] font-semibold">
          {t("story.loading")}
        </b>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="block aspect-video rounded-xl bg-[var(--st-sub)]" />
          ))}
        </div>
      </section>
    </div>
  );
}

function handoffPrompt(path: string): string {
  return `Create a \`${path}\` at the project root to plan this video frame by frame.

Use this format:

---
format: 1920x1080
message: <the one-line takeaway of the video>
arc: <the narrative shape, e.g. Problem → Solution>
audience: <who it's for>
---

## Frame 1 — <title>
- duration: 5s
- transition_in: crossfade
- status: outline
- src: compositions/frames/01-<slug>.html

<A sentence or two: what's on screen and what the narration says.>

Add one \`## Frame N\` section per beat. Keep the arc tight.

Then run the review loop from the hyperframes-core skill (references/review-loop.md): present the plan as a proposal, offer wireframe sketches on this board, and build on the confirmed layouts.`;
}

/** St-Output-StoryboardEmpty: illustration, one title, "Cere ajutor" with the plan prompt. */
function EmptyState({ path }: { path: string }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <img
        src={illustrationSrc("studio-empty-project")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-[168px] w-[168px] object-contain"
      />
      <b className="font-display text-lg font-semibold leading-6">{t("story.emptyTitle")}</b>
      <AgentChatMessageButton message={handoffPrompt(path)} />
      {/* The board names the plan "Storyboard"; the file it lives in stays in the tooltip. */}
      <span
        title={path}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-studio-surface pr-3 pl-2.5 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--st-bd)]"
      >
        <OutputIcon name="film" size={14} />
        {t("story.title")}
      </span>
    </div>
  );
}
