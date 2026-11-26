// The cut at the top of the clip inspector (St-Main): a 40px frame, the clip name and
// "length · format".
import { useStudioShellContext } from "../../contexts/StudioContext";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import type { DomEditSelection } from "./domEditingTypes";
import { formatAspect, formatClipLength } from "./cutFormatting";

interface CutSourceFacts {
  videoSrc: string | null;
  aspect: string | null;
}

function readCutSource(source: string | null): CutSourceFacts {
  if (!source) return { videoSrc: null, aspect: null };
  const doc = new DOMParser().parseFromString(source, "text/html");
  const root = doc.querySelector("[data-composition-id]");
  const video = doc.querySelector("video");
  return {
    videoSrc: video?.getAttribute("src") ?? null,
    aspect: formatAspect(
      Number(root?.getAttribute("data-width")),
      Number(root?.getAttribute("data-height")),
    ),
  };
}

export function CutIdentity({
  selection,
  source,
  duration,
}: {
  selection: DomEditSelection;
  source: string | null;
  /** The cut length from the parent timeline; falls back to the element attribute. */
  duration?: number;
}) {
  const { projectId } = useStudioShellContext();
  const { videoSrc, aspect } = readCutSource(source);
  const element = selection.element;
  const name = element.getAttribute("data-label") || selection.label || selection.id || "";
  const length = formatClipLength(duration ?? Number(element.getAttribute("data-duration")));
  const frame = videoSrc && projectId ? resolveMediaPreviewUrl(videoSrc, projectId) : null;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="relative h-10 w-10 flex-none overflow-hidden rounded-[10px] bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-sbd)]">
        {frame && (
          <video
            src={`${frame}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-[13px] font-semibold text-studio-text" title={name}>
          {name}
        </b>
        <span className="text-xs tabular-nums text-studio-muted">
          {aspect ? `${length} · ${aspect}` : length}
        </span>
      </span>
    </div>
  );
}
