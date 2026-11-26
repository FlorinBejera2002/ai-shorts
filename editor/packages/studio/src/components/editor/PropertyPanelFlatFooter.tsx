// Element inspector footer (St-Inspector-Element): "Cere ajutor" opens Ana și Radu with the
// selected element, and "Înregistrează gestul (R)" records a motion gesture.
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t, useLocale } from "../../i18n/translate";
import { illustrationSrc } from "../ui";

export function PropertyPanelFlatFooter({
  onAskAgent,
  recordingState,
  recordingDuration,
  onToggleRecording,
}: {
  onAskAgent?: () => void;
  recordingState?: "idle" | "recording" | "preview";
  recordingDuration?: number;
  onToggleRecording?: () => void;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const recording = recordingState === "recording";
  const recordTitle = recording
    ? t("flat.stopRecording", { s: (recordingDuration ?? 0).toFixed(1) })
    : t("flat.record");

  return (
    <div className="flex flex-none flex-col items-center gap-1.5 bg-studio-surface px-4 pt-3 pb-3">
      <button
        type="button"
        data-flat-footer-ask="true"
        onClick={() => {
          track("button", "Ask agent");
          onAskAgent?.();
        }}
        disabled={!onAskAgent}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <img
          src={illustrationSrc("agent-avatar-duo")}
          alt=""
          aria-hidden="true"
          className="h-6 w-6 rounded-full object-cover"
          draggable={false}
        />
        {t("inspector.askAgent")}
      </button>
      {onToggleRecording && (
        <button
          type="button"
          data-flat-footer-record="true"
          aria-label={recordTitle}
          title={recordTitle}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            track("button", "Gesture recording");
            onToggleRecording();
          }}
          className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)]"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 14 14"
            fill="currentColor"
            aria-hidden="true"
            className={recording ? "animate-pulse text-studio-danger" : "text-studio-muted"}
          >
            {/* Idle: a neutral ring; red is kept for the active recording only. */}
            {recording ? (
              <rect x="2" y="2" width="10" height="10" rx="1.5" />
            ) : (
              <circle cx="7" cy="7" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
          {recordTitle}
        </button>
      )}
    </div>
  );
}
