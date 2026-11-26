import { useState } from "react";
import { t, useLocale } from "../i18n/translate";
import { ShellIcon } from "./shell/ShellIcon";

interface SaveQueuePausedBannerProps {
  /** Why the queue paused (kept as the tooltip; the banner shows the short title). */
  message: string;
  /** Resets the save-queue circuit breaker so persistence resumes. */
  onRetry: () => void;
}

/**
 * Alert shown at the top of the preview card when the DOM-edit save queue circuit breaker
 * pauses persistence (St-SaveFailed). Closing it only hides the notice: the top bar keeps
 * showing "Salvare eșuată" until saving resumes.
 */
export function SaveQueuePausedBanner({ message, onRetry }: SaveQueuePausedBannerProps) {
  useLocale();
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  if (dismissedMessage === message) return null;
  return (
    <div
      role="alert"
      title={message}
      className="hf-backdrop-in flex h-[52px] w-full items-center gap-3 rounded-[16px] bg-studio-surface pl-2.5 pr-2 shadow-studio"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--st-danger-bg)] text-[var(--st-danger)]">
        <ShellIcon name="warning" size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-studio-text">
        {t("shell.savePaused")}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="h-9 flex-none whitespace-nowrap rounded-full bg-studio-accent px-3.5 text-[13px] font-semibold text-studio-on-accent active:scale-[0.98]"
      >
        {t("shell.retrySave")}
      </button>
      <button
        type="button"
        aria-label={t("shell.dismiss")}
        title={t("shell.dismiss")}
        onClick={() => setDismissedMessage(message)}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-sub)]"
      >
        <ShellIcon name="close" size={16} />
      </button>
    </div>
  );
}
