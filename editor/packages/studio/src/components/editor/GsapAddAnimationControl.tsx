import { ADD_METHODS } from "./gsapAnimationConstants";
import { MOTION_TEXT_BUTTON, MotionIcon } from "./motionUi";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

type AddMethod = (typeof ADD_METHODS)[number];

const METHOD_KEYS: Record<AddMethod, { label: MessageKey; tip: MessageKey }> = {
  set: { label: "motion.method.set", tip: "motion.methodTip.set" },
  to: { label: "motion.method.to", tip: "motion.methodTip.to" },
  from: { label: "motion.method.from", tip: "motion.methodTip.from" },
  fromTo: { label: "motion.method.fromTo", tip: "motion.methodTip.fromTo" },
};

const STYLES = {
  classic: {
    method:
      "rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white",
    cancel: "px-1.5 text-[11px] text-neutral-500 hover:text-neutral-300",
    trigger: "text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-200",
  },
  flat: {
    method: MOTION_TEXT_BUTTON,
    cancel:
      "inline-flex h-9 items-center px-2 text-[13px] font-medium text-studio-muted hover:text-studio-text",
    trigger: `${MOTION_TEXT_BUTTON} w-full gap-2`,
  },
};

export function GsapAddAnimationControl({
  open,
  setOpen,
  onAddAnimation,
  track,
  variant,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  onAddAnimation: (method: "to" | "from" | "set" | "fromTo") => void;
  track: (control: string, name: string) => void;
  variant: keyof typeof STYLES;
}) {
  useLocale();
  const styles = STYLES[variant];

  return (
    <div className="relative pt-1">
      {open ? (
        <div className="flex flex-wrap gap-1.5">
          {ADD_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              title={t(METHOD_KEYS[method].tip)}
              onClick={() => {
                track("button", `Add ${method} animation`);
                onAddAnimation(method);
                setOpen(false);
              }}
              className={styles.method}
            >
              {t(METHOD_KEYS[method].label)}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className={styles.cancel}>
            {t("motion.cancel")}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={styles.trigger}>
          {variant === "flat" && <MotionIcon name="plus" size={14} />}
          {t("motion.newAnimation")}
        </button>
      )}
    </div>
  );
}
