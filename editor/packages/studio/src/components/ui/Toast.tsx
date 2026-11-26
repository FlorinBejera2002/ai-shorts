// Presentational toast: one line of text and an optional action. Status tones use status tokens.
export type ToastTone = "default" | "success" | "error";

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
}

const TONE_CLASS: Record<ToastTone, string> = {
  default: "bg-studio-surface text-studio-text",
  success: "bg-[var(--st-ok-bg)] text-studio-ok",
  error: "bg-[var(--st-danger-bg)] text-studio-danger",
};

export function Toast({ message, tone = "default", action }: ToastProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm shadow-studio ${TONE_CLASS[tone]}`}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="flex-none rounded-full px-3 py-1 font-semibold text-studio-text hover:bg-[var(--st-sub)]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
