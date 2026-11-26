// Studio toast (St-Toast): 56px card, radius 16, a status circle, one line of text, an optional
// action ("Anulează") and a close button. Status colours only for status.
import { t, useLocale } from "../i18n/translate";
import { AgentIcon, type AgentIconName } from "./agent/AgentIcon";

export type StudioToastTone = "error" | "info" | "success";

interface StudioToastProps {
  message: string;
  tone?: StudioToastTone;
  /** Plays the exit animation when true (owner removes the node after ~160ms). */
  leaving?: boolean;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}

const TONE: Record<StudioToastTone, { circle: string; icon: AgentIconName }> = {
  success: { circle: "bg-[var(--st-ok-bg)] text-[var(--st-ok)]", icon: "check" },
  error: { circle: "bg-[var(--st-danger-bg)] text-[var(--st-danger)]", icon: "warning" },
  info: { circle: "bg-[var(--st-sub)] text-[var(--st-tx)]", icon: "sparkle" },
};

export function StudioToast({
  message,
  tone = "info",
  leaving,
  action,
  onDismiss,
}: StudioToastProps) {
  useLocale();
  const look = TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`motion-reduce:animate-none ${leaving ? "hf-toast-exit" : "hf-toast-enter"}`}
    >
      <div
        className="flex min-h-14 w-[min(384px,calc(100vw-32px))] items-center gap-3 rounded-[16px] bg-[var(--st-sf)] py-2 pl-2.5 pr-2 text-[var(--st-tx)] "
        style={{ boxShadow: "var(--st-sh), 0 16px 40px rgba(21, 32, 53, 0.14)" }}
      >
        <span
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${look.circle}`}
        >
          <AgentIcon name={look.icon} size={16} strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-[18px]">
          {message}
        </span>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="h-9 flex-none rounded-full px-3 text-[13px] font-semibold text-[var(--st-tx)] hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
          >
            {action.label}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("agent.closeToast")}
            title={t("agent.closeToast")}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--st-tx)] hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
          >
            <AgentIcon name="close" size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
