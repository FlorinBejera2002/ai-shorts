// Shared look of the Motion / Timing section (St-Inspector-AnimCard, -Keyframes, -EasePresets,
// -EaseParams): 16px cards with a hairline inset, 44px boxed fields at 14px radius and round
// 32px icon buttons. Token colours only.
import type { ReactNode } from "react";
import { CommitField } from "./propertyPanelCommitField";
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { EASE_PRESETS } from "./easePresetLibrary";

export const MOTION_CARD =
  "flex min-w-0 flex-col gap-2.5 rounded-[16px] bg-studio-surface p-3 shadow-[inset_0_0_0_1px_var(--st-bd)]";
export const MOTION_FIELD =
  "flex h-11 min-w-0 items-center gap-2 rounded-md bg-studio-surface pl-3.5 pr-3 text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] focus-within:shadow-[inset_0_0_0_2px_var(--st-btn)]";
export const MOTION_HEADING =
  "flex min-h-6 items-center text-[13px] font-semibold text-studio-text";
export const MOTION_ICON_BUTTON =
  "inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text transition-colors hover:bg-[var(--st-sub)] disabled:opacity-40";
export const MOTION_TEXT_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-full px-3.5 text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] transition-colors hover:bg-[var(--st-sub)]";
export const MOTION_INPUT =
  "h-9 min-w-0 rounded-sm bg-studio-surface px-2.5 text-[13px] font-medium tabular-nums text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none focus:shadow-[inset_0_0_0_2px_var(--st-btn)]";

const ICONS = {
  copy: "M9 9h11v11H9zM5 15V5h10",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  check: "M5 12l5 5L20 7",
  chevron: "M6 9l6 6 6-6",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
} as const;

export function MotionIcon({ name, size = 16 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block flex-none"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** A 44px boxed number field: label on the left, editable value and unit on the right. */
export function MotionNumberField({
  label,
  value,
  suffix,
  title,
  onCommit,
}: {
  label: string;
  value: string;
  suffix?: string;
  title?: string;
  onCommit: (next: string) => void;
}) {
  return (
    <label className={MOTION_FIELD} title={title}>
      <span className="flex-none text-studio-muted">{label}</span>
      <span className="min-w-0 flex-1 text-right tabular-nums">
        <CommitField value={value} align="right" onCommit={onCommit} />
      </span>
      {suffix && <span className="flex-none text-studio-muted">{suffix}</span>}
    </label>
  );
}

/** A 44px boxed native select with the board's chevron. */
export function MotionSelect({
  label,
  value,
  options,
  onChange,
  leading,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (next: string) => void;
  leading?: ReactNode;
}) {
  const rendered = options.some((option) => option.value === value)
    ? options
    : [{ value, label: value }, ...options];
  return (
    <label className={`${MOTION_FIELD} relative`}>
      {leading}
      <select
        aria-label={label}
        title={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-5 text-[13px] font-medium text-studio-text outline-none"
      >
        {rendered.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 text-studio-text">
        <MotionIcon name="chevron" size={14} />
      </span>
    </label>
  );
}

/** Localised name of an ease token: a preset name when one matches, otherwise the token. */
export function easeDisplayName(ease: string): string {
  if (ease.startsWith("custom(")) return t("motion.customCurve");
  const preset = EASE_PRESETS.find((candidate) => candidate.ease === ease);
  return preset ? easePresetDisplayLabel(preset) : ease;
}

/** Localised preset label; presets without a translation keep their own label. */
export function easePresetDisplayLabel(preset: { id: string; label: string }): string {
  const bounce = /^bounce-(\d+)$/.exec(preset.id);
  if (bounce) return t("ease.bounce-n", { n: bounce[1] });
  if (preset.id.startsWith("flow-")) return preset.label;
  const key = `ease.${preset.id}`;
  return isMessageKey(key) ? t(key) : preset.label;
}

const EASE_PRESET_KEYS = new Set<string>([
  "ease.linear",
  "ease.ease-in",
  "ease.quad-in",
  "ease.cubic-in",
  "ease.ease-out",
  "ease.quad-out",
  "ease.cubic-out",
  "ease.ease",
  "ease.quad-ease",
  "ease.cubic-ease",
  "ease.circular-ease",
  "ease.rebound-in",
  "ease.rebound-out",
  "ease.rebound-ease",
  "ease.expo-in",
  "ease.expo-out",
  "ease.hold",
  "ease.spring-gentle",
  "ease.spring-quick",
  "ease.spring-bouncy",
  "ease.spring-slow",
]);

function isMessageKey(key: string): key is MessageKey {
  return EASE_PRESET_KEYS.has(key);
}

/** Options for an ease select: localised preset names for the tokens that have one. */
export function easeOptions(tokens: readonly string[]): Array<{ value: string; label: string }> {
  return tokens.map((token) => {
    if (token === "custom") return { value: token, label: t("motion.customCurve") };
    const name = easeDisplayName(token);
    return { value: token, label: name === token ? token : `${name} · ${token}` };
  });
}
