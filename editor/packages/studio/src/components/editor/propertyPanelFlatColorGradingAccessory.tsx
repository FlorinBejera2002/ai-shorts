import { useEffect, useRef } from "react";
import { isHfColorGradingActive } from "@hyperframes/core/color-grading";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t, useLocale } from "../../i18n/translate";
import { gradeStatusLabel } from "./propertyPanelColorLabels";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";
import type { ColorGradingControllerState } from "./useColorGradingController";

// St-Inspector-GradeActions: "Ține pentru original" (secondary pill, hold to compare) and
// "Resetează culoarea" (ghost), with the shader status shown as a status dot.
const STATUS_DOT_CLASS: Record<ColorGradingControllerState["runtimeStatus"]["state"], string> = {
  active: "bg-[var(--st-ok)]",
  pending: "bg-[var(--st-warn)]",
  unavailable: "bg-[var(--st-danger)]",
  missing: "bg-[var(--st-hd)]",
  inactive: "bg-[var(--st-hd)]",
};

// The dot only appears when the shader needs attention; the label stays readable by screen readers.
const SHOW_STATUS_DOT: Record<ColorGradingControllerState["runtimeStatus"]["state"], boolean> = {
  active: false,
  pending: true,
  unavailable: true,
  missing: false,
  inactive: false,
};

export function FlatColorGradingAccessory({
  state,
}: {
  state: Pick<
    ColorGradingControllerState,
    "grading" | "compareEnabled" | "runtimeStatus" | "commitCompare" | "resetGrading"
  >;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const { grading, compareEnabled, runtimeStatus, commitCompare, resetGrading } = state;
  const gradingActive = isHfColorGradingActive(grading);
  const releaseRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      releaseRef.current?.();
      releaseRef.current = null;
    },
    [],
  );
  const statusLabel = gradeStatusLabel(runtimeStatus.message);

  return (
    <span
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2"
      data-flat-grade-actions="true"
    >
      <button
        type="button"
        aria-pressed={compareEnabled}
        aria-label={t("look.compare")}
        disabled={!gradingActive}
        onPointerDown={(e) => {
          if (!gradingActive) return;
          e.preventDefault();
          e.stopPropagation();
          track("button", "Compare original");
          commitCompare(true);
          const release = () => {
            commitCompare(false);
            window.removeEventListener("pointerup", release);
            window.removeEventListener("pointercancel", release);
            window.removeEventListener("blur", release);
            releaseRef.current = null;
          };
          releaseRef.current = release;
          window.addEventListener("pointerup", release);
          window.addEventListener("pointercancel", release);
          window.addEventListener("blur", release);
        }}
        onBlur={() => {
          if (compareEnabled) commitCompare(false);
        }}
        onKeyDown={(e) => {
          if (!gradingActive || (e.key !== " " && e.key !== "Enter")) return;
          e.preventDefault();
          if (!compareEnabled) {
            track("button", "Compare original");
            commitCompare(true);
          }
        }}
        onKeyUp={(e) => {
          if (!gradingActive || (e.key !== " " && e.key !== "Enter")) return;
          e.preventDefault();
          commitCompare(false);
        }}
        title={t("look.compare")}
        className={`relative inline-flex h-11 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] transition-colors hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] disabled:cursor-not-allowed disabled:opacity-45 ${
          compareEnabled ? "bg-[var(--st-sub)]" : ""
        }`}
      >
        <LookIcon d={LOOK_ICONS.eye} />
        {t("look.compare")}
        <span className="absolute top-1 right-1.5 flex" title={statusLabel}>
          {SHOW_STATUS_DOT[runtimeStatus.state] && (
            <span
              data-flat-grade-status-dot="true"
              title={runtimeStatus.message}
              className={`h-2 w-2 flex-none rounded-full ${STATUS_DOT_CLASS[runtimeStatus.state]}`}
            />
          )}
          <span data-flat-grade-status-message="true" className="sr-only">
            {statusLabel}
          </span>
        </span>
      </button>
      <button
        type="button"
        data-flat-grade-reset="true"
        title={t("look.reset")}
        onClick={(e) => {
          e.stopPropagation();
          track("button", "Reset color grading");
          resetGrading();
        }}
        className="inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full px-1.5 text-[13px] font-medium text-studio-text transition-colors hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
      >
        <LookIcon d={LOOK_ICONS.reset} />
        <span className="whitespace-nowrap">{t("look.resetShort")}</span>
      </button>
    </span>
  );
}
