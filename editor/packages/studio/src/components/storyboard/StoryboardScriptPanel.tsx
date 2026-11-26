import type { StoryboardScript } from "../../hooks/useStoryboard";
import { t, useLocale } from "../../i18n/translate";

export interface StoryboardScriptPanelProps {
  script: StoryboardScript;
}

/**
 * Collapsible view of the companion narration script (SCRIPT.md). The mature
 * pipeline keeps the full voiceover script — voice settings, per-line delivery
 * and timing — in this file; here it's surfaced read-only alongside the frames.
 * (Per-frame VO iteration will live in the frame focus view.)
 */
export function StoryboardScriptPanel({ script }: StoryboardScriptPanelProps) {
  useLocale();
  if (!script.exists) return null;
  return (
    <details className="rounded-[14px] bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)]">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-[13px] font-semibold">
        {t("story.script")}
        <span className="ml-2 font-mono text-xs font-normal text-[var(--st-t3)]">
          {script.path}
        </span>
      </summary>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-3 pb-3 text-xs leading-relaxed text-[var(--st-t2)]">
        {script.content}
      </pre>
    </details>
  );
}
