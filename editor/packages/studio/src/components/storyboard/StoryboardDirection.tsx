import type { StoryboardGlobals } from "@hyperframes/core/storyboard";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { StoryboardStatusLegend } from "./StoryboardStatusLegend";

export interface StoryboardDirectionProps {
  globals: StoryboardGlobals;
  frameCount: number;
}

/**
 * "Direcție" (St-Output-Storyboard, left card): the message as the title, then arc, audience,
 * voice, format and frame count as 38px rows, then the status legend. This is the storyboard's
 * north star pulled from the manifest frontmatter.
 */
export function StoryboardDirection({ globals, frameCount }: StoryboardDirectionProps) {
  useLocale();
  const meta: { key: MessageKey; value: string | undefined }[] = [
    { key: "story.arc", value: globals.arc },
    { key: "story.audience", value: globals.audience },
    { key: "story.voice", value: globals.extra.voice },
    { key: "story.format", value: globals.format },
    { key: "story.frames", value: String(frameCount) },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <b
        className={`font-display text-[15px] font-semibold leading-5 ${
          globals.message ? "" : "text-[var(--st-t2)]"
        }`}
      >
        {globals.message || t("story.untitled")}
      </b>
      {meta
        .filter((item): item is { key: MessageKey; value: string } => Boolean(item.value))
        .map((item) => (
          <span
            key={item.key}
            className="flex h-[38px] min-w-0 items-center justify-between gap-2 rounded-[14px] bg-studio-surface px-3 text-xs shadow-[inset_0_0_0_1px_var(--st-bd)]"
          >
            <b className="font-semibold">{t(item.key)}</b>
            <span className="min-w-0 truncate text-[var(--st-t2)]" title={item.value}>
              {item.value}
            </span>
          </span>
        ))}
      <StoryboardStatusLegend />
    </div>
  );
}
