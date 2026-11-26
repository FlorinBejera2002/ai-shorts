// Header row of an animation card: the method name, when it plays and its curve (the whole
// row toggles the card), then copy and remove actions (St-Inspector-AnimCard).
import { useState } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { MOTION_ICON_BUTTON, MotionIcon, easeDisplayName } from "./motionUi";
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

const METHOD_KEYS: Record<string, { label: MessageKey; tip: MessageKey }> = {
  set: { label: "motion.method.set", tip: "motion.methodTip.set" },
  to: { label: "motion.method.to", tip: "motion.methodTip.to" },
  from: { label: "motion.method.from", tip: "motion.methodTip.from" },
  fromTo: { label: "motion.method.fromTo", tip: "motion.methodTip.fromTo" },
};

export function animationMethodLabel(method: string): string {
  const keys = METHOD_KEYS[method];
  return keys ? t(keys.label) : method;
}

export function animationMethodTip(method: string): string | undefined {
  const keys = METHOD_KEYS[method];
  return keys ? t(keys.tip) : undefined;
}

function formatSeconds(value: number | string | undefined): string {
  if (typeof value !== "number") return value ?? "";
  return `${parseFloat(value.toFixed(3))}s`;
}

export function AnimationCardHeader({
  animation,
  easeName,
  expanded,
  summary,
  onToggle,
  onDelete,
}: {
  animation: GsapAnimation;
  easeName: string;
  expanded: boolean;
  summary: string;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const end =
    typeof animation.position === "number"
      ? animation.position + (animation.duration ?? 0)
      : animation.position;
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full pl-1 pr-2 text-left"
      >
        <b
          className="flex-none text-[13px] font-semibold text-studio-text"
          title={animationMethodTip(animation.method)}
        >
          {animationMethodLabel(animation.method)}
        </b>
        <span className="flex-none text-[12px] font-medium tabular-nums text-studio-muted">
          {formatSeconds(animation.position)} – {formatSeconds(end)}
        </span>
        <span
          className="ml-auto min-w-0 truncate text-[12px] font-medium text-studio-muted"
          title={easeName}
        >
          {easeDisplayName(easeName)}
        </span>
        <span
          className={`flex-none text-studio-muted transition-transform ${expanded ? "" : "-rotate-90"}`}
        >
          <MotionIcon name="chevron" size={14} />
        </span>
      </button>
      <button
        type="button"
        className={MOTION_ICON_BUTTON}
        aria-label={copied ? t("motion.copied") : t("motion.copyTitle")}
        title={summary}
        onClick={() => {
          void navigator.clipboard?.writeText(summary);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <MotionIcon name={copied ? "check" : "copy"} />
      </button>
      <button
        type="button"
        className={MOTION_ICON_BUTTON}
        aria-label={t("motion.remove")}
        title={t("motion.removeTitle")}
        onClick={onDelete}
      >
        <MotionIcon name="trash" />
      </button>
    </div>
  );
}
