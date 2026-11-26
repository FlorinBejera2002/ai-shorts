// Mode chrome drawn over the preview stage: caption editing pill and sync error
// (St-Preview-CaptionSync), "Editează subtitrările" re-entry (St-Preview-CaptionReenter),
// gesture recording timer and stop pill (St-Preview-Gesture) and the armed motion destination
// (St-Preview-MotionArmed). Positions follow the stage rectangle published by PreviewPane.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { StudioLocale } from "../../../i18n/dictionary";
import { t, useLocale, usesDecimalComma } from "../../../i18n/translate";
import { useCaptionStore } from "../../../captions/store";
import { useIsPhone } from "../../shell/useIsPhone";
import { usePlayerStore } from "../../../player/store/playerStore";
import {
  CANVAS_CHIP,
  POPOVER_SHADOW,
  PreviewIcon,
  PreviewIconButton,
  PrimaryPill,
} from "./previewChrome";
import { PHONE_SYNC_TOP } from "./phoneStageReserve";

/** Box matching the fitted stage inside the preview surface. */
const STAGE_BOX: CSSProperties = {
  left: "calc(50% - var(--preview-stage-w, 100%) / 2)",
  top: "calc(50% - var(--preview-stage-h, 100%) / 2)",
  width: "var(--preview-stage-w, 100%)",
  height: "var(--preview-stage-h, 100%)",
};

function StageLayer({ children }: { children: ReactNode }) {
  return (
    <div data-canvas-chrome="" className="pointer-events-none absolute z-[60]" style={STAGE_BOX}>
      {children}
    </div>
  );
}

function formatSeconds(seconds: number, locale: StudioLocale): string {
  const text = seconds.toFixed(1);
  return usesDecimalComma(locale) ? text.replace(".", ",") : text;
}

export function CaptionEditingPill({ onExit }: { onExit: () => void }) {
  useLocale();
  return (
    <StageLayer>
      <div className="pointer-events-auto absolute left-1/2 top-2.5 flex h-8 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-studio-surface pl-3 pr-1 text-xs font-semibold text-studio-text shadow-studio">
        <PreviewIcon name="captions" size={14} />
        <span>{t("preview.editingCaptions")}</span>
        <button
          type="button"
          onClick={onExit}
          className="h-6 rounded-full px-2.5 text-xs font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
        >
          {t("preview.exitCaptions")}
        </button>
      </div>
    </StageLayer>
  );
}

export function CaptionSyncError({ message }: { message: string }) {
  useLocale();
  const isPhone = useIsPhone();
  // Phone: the card sits 12px from the screen edges in the space PreviewPane reserves above the
  // stage (St-M-Preview-CaptionSync); desktop: across the top of the preview surface.
  return (
    <div
      role="alert"
      title={message}
      style={isPhone ? { top: PHONE_SYNC_TOP } : undefined}
      className={`absolute ${isPhone ? "inset-x-3" : "inset-x-0 top-0"} z-[61] flex min-h-[52px] min-w-0 items-center gap-3 rounded-[16px] bg-studio-surface py-1.5 pl-2.5 pr-2 text-studio-text ${POPOVER_SHADOW}`}
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[var(--st-danger-bg)] text-[var(--st-danger)]">
        <PreviewIcon name="warning" size={16} />
      </span>
      <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-[18px]">
        {t("preview.captionSyncFailed")}
      </span>
      <PrimaryPill height={36} onClick={() => useCaptionStore.getState().retrySave?.()}>
        {t("preview.retry")}
      </PrimaryPill>
      <PreviewIconButton
        label={t("preview.dismissNotice")}
        size={32}
        onClick={() => useCaptionStore.getState().setSyncError(null)}
      >
        <PreviewIcon name="close" size={16} />
      </PreviewIconButton>
    </div>
  );
}

export function CaptionReenterButton({ onEnter }: { onEnter: () => void }) {
  useLocale();
  return (
    <StageLayer>
      <div className="absolute inset-x-0 bottom-3.5 flex justify-center">
        <button
          type="button"
          onClick={onEnter}
          className="pointer-events-auto inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-studio-surface px-3.5 text-xs font-semibold text-studio-text shadow-studio hover:bg-[var(--st-sub)]"
        >
          <PreviewIcon name="captions" size={14} />
          {t("preview.editCaptions")}
        </button>
      </div>
    </StageLayer>
  );
}

/** Elapsed seconds since recording started; local, because only the inspector gets the hook value. */
function useRecordingSeconds(recording: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!recording) {
      setSeconds(0);
      return;
    }
    const start = performance.now();
    const timer = window.setInterval(() => setSeconds((performance.now() - start) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [recording]);
  return seconds;
}

export function GestureRecordingChrome({
  recording,
  onStop,
}: {
  recording: boolean;
  onStop?: () => void;
}) {
  const locale = useLocale();
  const seconds = useRecordingSeconds(recording);
  if (!recording) return null;
  const value = formatSeconds(seconds, locale);
  return (
    <StageLayer>
      <span className={`absolute left-2.5 top-2.5 ${CANVAS_CHIP}`}>
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--st-danger)]" />
        {value} s
      </span>
      {onStop && (
        <div className="absolute inset-x-0 bottom-3.5 flex justify-center">
          <button
            type="button"
            aria-label={t("preview.stopRecording")}
            onClick={onStop}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-[var(--st-danger)] px-4 text-[13px] font-semibold text-studio-on-accent"
          >
            <PreviewIcon name="stop" size={12} />
            {t("preview.stopRecordingValue", { s: value })}
          </button>
        </div>
      )}
    </StageLayer>
  );
}

export function MotionArmedChrome() {
  useLocale();
  const armed = usePlayerStore((s) => s.motionPathArmed);
  const setArmed = usePlayerStore((s) => s.setMotionPathArmed);
  if (!armed) return null;
  return (
    <StageLayer>
      <span className="absolute inset-x-2.5 top-2.5 flex justify-center">
        <button
          type="button"
          onClick={() => setArmed(false)}
          aria-pressed="true"
          className="pointer-events-auto inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-studio-selected px-3 text-xs font-semibold text-studio-on-selected"
        >
          <PreviewIcon name="arrowRight" size={14} />
          {t("preview.motionDestination")}
        </button>
      </span>
      <span className="absolute inset-x-2.5 bottom-3.5 text-center">
        <span className="inline-block max-w-[200px] rounded-sm bg-studio-surface px-2.5 py-1.5 text-xs font-semibold text-studio-text shadow-studio">
          {t("preview.motionDestinationHint")}
        </span>
      </span>
    </StageLayer>
  );
}

/** Read-only badge on the generated original of a source-cut clip (St-M-Preview-Original). On
 * desktop the "Video original" inspector panel carries that state instead (St-Original). */
export function OriginalVideoChip({ visible }: { visible: boolean }) {
  useLocale();
  const isPhone = useIsPhone();
  if (!visible || !isPhone) return null;
  return (
    <StageLayer>
      <span className={`absolute left-2.5 top-2.5 !h-7 ${CANVAS_CHIP}`}>
        <PreviewIcon name="lock" size={12} />
        {t("preview.originalVideo")}
      </span>
    </StageLayer>
  );
}
