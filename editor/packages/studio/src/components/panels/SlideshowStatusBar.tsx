/**
 * Status row for SlideshowPanel: the unsaved badge with retry, and the in-panel
 * undo button. Renders nothing when there is neither a persist error nor undo
 * history to show.
 */

import { t, useLocale } from "../../i18n/translate";
import { OutputButton } from "../output/OutputButton";

export interface SlideshowStatusBarProps {
  persistError: boolean;
  retrying: boolean;
  undoDepth: number;
  onRetry: () => void;
  onUndo: () => void;
}

export function SlideshowStatusBar({
  persistError,
  retrying,
  undoDepth,
  onRetry,
  onUndo,
}: SlideshowStatusBarProps) {
  useLocale();
  if (!persistError && undoDepth === 0) return null;
  // St-Output-SlideshowUnsaved: status badge, retry and undo on one row.
  return (
    <div className="flex items-center gap-2">
      {persistError ? (
        <span
          role="alert"
          className="inline-flex h-7 items-center rounded-lg bg-[var(--st-warn-bg)] px-2 text-xs font-semibold text-[var(--st-warn)]"
        >
          {t("slides.unsaved")}
        </span>
      ) : null}
      <span className="flex-1" />
      {persistError ? (
        <OutputButton
          height={32}
          padX={10}
          fontSize={12}
          icon="refresh"
          iconSize={14}
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? t("slides.retrying") : t("slides.retry")}
        </OutputButton>
      ) : null}
      {undoDepth > 0 ? (
        <OutputButton
          variant="ghost"
          height={32}
          padX={10}
          fontSize={12}
          title={t("slides.undo")}
          onClick={onUndo}
        >
          {t("slides.undoCount", { n: undoDepth })}
        </OutputButton>
      ) : null}
    </div>
  );
}
