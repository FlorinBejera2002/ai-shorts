// Text inspector controls from the boards St-Text, St-Inspector-Weight and
// St-Inspector-Metrics: the Normal / Îngroșat / Cursiv segment, the size slider, the weight
// select, the colour swatches, the worded alignment segment and the case segment.
import { useRef, useState, type ReactNode } from "react";
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { InspectorRange, InspectorSelect } from "./inspectorControls";

/** A full-width pill segment whose buttons may each be pressed (bold and italic together). */
export function FlatToggleSegment({
  label,
  options,
  disabled,
  compact = false,
  onChange,
}: {
  label: string;
  options: readonly { key: string; node: ReactNode; label: string; active: boolean }[];
  disabled?: boolean;
  /** Smaller type for long labels (MAJUSCULE) so four options fit in the inspector. */
  compact?: boolean;
  onChange: (key: string) => void;
}) {
  const track = useTrackDesignInput();
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 gap-0.5 rounded-full bg-studio-surface p-1 shadow-[inset_0_0_0_1.5px_var(--st-bd)]"
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          data-flat-segment="true"
          aria-label={option.label}
          aria-pressed={option.active}
          disabled={disabled}
          onClick={() => {
            track("segmented", label);
            onChange(option.key);
          }}
          className={[
            "inline-flex h-10 min-w-0 flex-1 items-center justify-center truncate rounded-full transition-colors disabled:opacity-45",
            compact ? "px-1 text-xs" : "px-2 text-[13px]",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-btn)]",
            option.active
              ? "bg-studio-selected font-semibold text-studio-on-selected"
              : "font-medium text-studio-text hover:bg-[var(--st-sub)]",
          ].join(" ")}
        >
          {option.node}
        </button>
      ))}
    </div>
  );
}

/** Labelled block: the title above its control (Greutate, Culoare, Majuscule). */
export function FlatField({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-studio-text">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

/** St-Text "Culoare": the label and its control on one 44px row. */
export function FlatInlineField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-3">
      <span className="flex-none text-[13px] font-medium text-studio-text">{label}</span>
      {children}
    </div>
  );
}

const BOLD_FROM = 600;

/** St-Text: Normal / Îngroșat / Cursiv. Bold and italic toggle independently. */
export function TextStyleSegment({
  weight,
  fontStyle,
  onSetStyle,
}: {
  weight: string;
  fontStyle: string;
  onSetStyle: (property: "font-weight" | "font-style", value: string) => void;
}) {
  const bold = Number(weight) >= BOLD_FROM || weight === "bold" || weight === "bolder";
  const italic = fontStyle === "italic" || fontStyle === "oblique";
  return (
    <FlatToggleSegment
      label={t("text.fontStyle")}
      options={[
        {
          key: "normal",
          node: t("text.styleNormal"),
          label: t("text.styleNormal"),
          active: !bold && !italic,
        },
        { key: "bold", node: t("text.styleBold"), label: t("text.styleBold"), active: bold },
        {
          key: "italic",
          node: t("text.styleItalic"),
          label: t("text.styleItalic"),
          active: italic,
        },
      ]}
      onChange={(key) => {
        if (key === "normal") {
          if (bold) onSetStyle("font-weight", "400");
          if (italic) onSetStyle("font-style", "normal");
        } else if (key === "bold") {
          onSetStyle("font-weight", bold ? "400" : "700");
        } else {
          onSetStyle("font-style", italic ? "normal" : "italic");
        }
      }}
    />
  );
}

const SIZE_MIN = 8;
const SIZE_MAX = 300;

/** The slider under the Mărime row, shown when the size is in px. */
export function TextSizeSlider({
  value,
  onPreview,
  onCommit,
}: {
  value: string;
  onPreview: (next: string) => void;
  onCommit: (next: string) => void;
}) {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  if (!match) return null;
  const px = Number(match[1]);
  return (
    <SizeRange
      key={value}
      initial={px}
      onPreview={(next) => onPreview(`${next}px`)}
      onCommit={(next) => onCommit(`${next}px`)}
    />
  );
}

function SizeRange({
  initial,
  onPreview,
  onCommit,
}: {
  initial: number;
  onPreview: (next: number) => void;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(initial);
  // The value on the right reads as plain text (St-Text) but can be typed into for an exact size.
  const [typed, setTyped] = useState<string | null>(null);
  const latest = useRef(initial);
  const commitTyped = () => {
    setTyped(null);
    if (latest.current !== initial) onCommit(latest.current);
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="font-medium text-studio-text">{t("text.size")}</span>
        <input
          type="text"
          inputMode="decimal"
          aria-label={t("text.sizeValue")}
          value={typed ?? String(draft)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setTyped(text);
            const match = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(text);
            if (!match) return;
            const next = Number(match[1]);
            latest.current = next;
            setDraft(next);
            onPreview(next);
          }}
          onBlur={commitTyped}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="w-14 rounded-sm bg-transparent text-right font-semibold tabular-nums text-studio-muted outline-none focus-visible:text-studio-text focus-visible:shadow-[0_0_0_2px_var(--st-btn)]"
        />
      </div>
      <InspectorRange
        ariaLabel={t("text.size")}
        value={draft}
        min={SIZE_MIN}
        max={Math.max(SIZE_MAX, initial, draft)}
        onChange={(next) => {
          latest.current = next;
          setDraft(next);
          onPreview(next);
        }}
        onCommit={() => {
          if (latest.current !== initial) onCommit(latest.current);
        }}
      />
    </div>
  );
}

const WEIGHT_KEYS: Record<string, MessageKey> = {
  "100": "text.w100",
  "200": "text.w200",
  "300": "text.w300",
  "400": "text.w400",
  "500": "text.w500",
  "600": "text.w600",
  "700": "text.w700",
  "800": "text.w800",
  "900": "text.w900",
};

export function weightLabel(weight: string): string {
  const key = WEIGHT_KEYS[weight];
  return key ? t(key) : weight;
}

/** St-Inspector-Weight: "Greutate" over a 44px select of the weights the font has. */
export function TextWeightSelect({
  weight,
  options,
  onChange,
}: {
  weight: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  const track = useTrackDesignInput();
  const values = options.includes(weight) ? options : [weight, ...options];
  return (
    <FlatField label={t("text.weight")}>
      <InspectorSelect
        label={t("text.weight")}
        value={weight}
        options={values.map((value) => ({ value, label: weightLabel(value) }))}
        onChange={(next) => {
          track("select", "Weight");
          onChange(next);
        }}
      />
    </FlatField>
  );
}

// Preset text colours as CSS colour values (written into the composition, not UI colours).
const SWATCHES: readonly { value: string; label: MessageKey }[] = [
  { value: "rgb(255, 255, 255)", label: "text.swatchWhite" },
  { value: "rgb(0, 0, 0)", label: "text.swatchBlack" },
  { value: "rgb(250, 204, 21)", label: "text.swatchYellow" },
  { value: "rgb(148, 163, 184)", label: "text.swatchGrey" },
];

function sameColor(a: string, b: string): boolean {
  return a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase();
}

/** St-Text "Culoare": four 36px swatches; the current colour is ringed. */
export function TextColorSwatches({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const track = useTrackDesignInput();
  return (
    <div role="group" aria-label={t("text.color")} className="flex items-center gap-2.5 p-1">
      {SWATCHES.map((swatch) => {
        const active = sameColor(swatch.value, value);
        return (
          <button
            key={swatch.value}
            type="button"
            aria-label={t(swatch.label)}
            aria-pressed={active}
            title={t(swatch.label)}
            onClick={() => {
              track("swatch", "Text color");
              if (!active) onCommit(swatch.value);
            }}
            className={[
              "h-9 w-9 flex-none rounded-[10px] transition-shadow",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]",
              active
                ? "shadow-[0_0_0_2px_var(--st-sf),0_0_0_4px_var(--st-tx)]"
                : "shadow-[inset_0_0_0_1.5px_var(--st-bd)]",
            ].join(" ")}
            style={{ backgroundColor: swatch.value }}
          />
        );
      })}
    </div>
  );
}

const ALIGN_OPTIONS: readonly { key: string; label: MessageKey }[] = [
  { key: "left", label: "text.alignLeft" },
  { key: "center", label: "text.alignCenter" },
  { key: "right", label: "text.alignRight" },
];

const JUSTIFY_ICON = "M4 6h16M4 12h16M4 18h16";

/** St-Text "Aliniere": Stânga / Centru / Dreapta, plus justify as an icon. */
export function TextAlignSegment({
  align,
  onChange,
}: {
  align: string;
  onChange: (next: string) => void;
}) {
  const isActive = (key: string) =>
    align === key || (key === "left" && align === "start") || (key === "right" && align === "end");
  return (
    <FlatToggleSegment
      label={t("text.align")}
      options={[
        ...ALIGN_OPTIONS.map((option) => ({
          key: option.key,
          node: t(option.label),
          label: t(option.label),
          active: isActive(option.key),
        })),
        {
          key: "justify",
          node: (
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d={JUSTIFY_ICON} />
            </svg>
          ),
          label: t("text.alignJustify"),
          active: align === "justify",
        },
      ]}
      onChange={(next) => {
        // Re-clicking the option shown for a logical value ("start"/"end") must not rewrite it
        // to the physical "left"/"right": that breaks RTL content.
        if (isActive(next)) return;
        onChange(next);
      }}
    />
  );
}

const CASE_OPTIONS: readonly { key: string; label: MessageKey }[] = [
  { key: "none", label: "text.caseNone" },
  { key: "uppercase", label: "text.caseUpper" },
  { key: "lowercase", label: "text.caseLower" },
  { key: "capitalize", label: "text.caseTitle" },
];

/** St-Inspector-Metrics "Majuscule": Normal / MAJUSCULE / minuscule / Titlu. */
export function TextCaseSegment({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <FlatField label={t("text.caseStyle")}>
      <FlatToggleSegment
        compact
        label={t("text.caseStyle")}
        options={CASE_OPTIONS.map((option) => ({
          key: option.key,
          node: t(option.label),
          label: t(option.label),
          active: value === option.key,
        }))}
        onChange={(next) => {
          if (next !== value) onChange(next);
        }}
      />
    </FlatField>
  );
}
