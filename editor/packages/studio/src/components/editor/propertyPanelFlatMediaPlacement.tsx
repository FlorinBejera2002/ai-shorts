// St-Inspector-Media placement: "Poziție" as a 3×3 grid of labelled chips and "Potrivire" as a
// 44px select of the object-fit values, both in the creator's words.
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { InspectorSelect } from "./inspectorControls";
import { FlatField } from "./propertyPanelFlatTextControls";

const POSITIONS: readonly { value: string; label: MessageKey }[] = [
  { value: "left top", label: "media.pos.left top" },
  { value: "top", label: "media.pos.top" },
  { value: "right top", label: "media.pos.right top" },
  { value: "left", label: "media.pos.left" },
  { value: "center", label: "media.pos.center" },
  { value: "right", label: "media.pos.right" },
  { value: "left bottom", label: "media.pos.left bottom" },
  { value: "bottom", label: "media.pos.bottom" },
  { value: "right bottom", label: "media.pos.right bottom" },
];

const FITS: readonly { value: string; label: MessageKey }[] = [
  { value: "cover", label: "media.fit.cover" },
  { value: "contain", label: "media.fit.contain" },
  { value: "fill", label: "media.fit.fill" },
  { value: "none", label: "media.fit.none" },
  { value: "scale-down", label: "media.fit.scale-down" },
];

/** "center center" and "top left" name the same spots as "center" and "left top". */
export function normalizeObjectPosition(value: string): string {
  const parts = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const horizontal = parts.find((part) => part === "left" || part === "right");
  const vertical = parts.find((part) => part === "top" || part === "bottom");
  if (horizontal && vertical) return `${horizontal} ${vertical}`;
  return horizontal ?? vertical ?? (parts.every((part) => part === "center") ? "center" : value);
}

export function MediaPositionGrid({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const track = useTrackDesignInput();
  const current = normalizeObjectPosition(value);
  return (
    <FlatField label={t("fl.position")}>
      <div role="group" aria-label={t("fl.position")} className="grid grid-cols-3 gap-2">
        {POSITIONS.map((position) => {
          const active = current === position.value;
          return (
            <button
              key={position.value}
              type="button"
              aria-pressed={active}
              data-media-position={position.value}
              onClick={() => {
                if (active) return;
                track("segmented", "Position");
                onChange(position.value);
              }}
              className={[
                "h-11 min-w-0 truncate rounded-md px-2 text-[13px] transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-btn)]",
                active
                  ? "bg-studio-selected font-semibold text-studio-on-selected"
                  : "font-medium text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-bd)] hover:bg-[var(--st-sub)]",
              ].join(" ")}
            >
              {t(position.label)}
            </button>
          );
        })}
      </div>
    </FlatField>
  );
}

export function MediaFitSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const track = useTrackDesignInput();
  const options = FITS.map((fit) => ({ value: fit.value, label: t(fit.label) }));
  return (
    <FlatField label={t("fl.fit")}>
      <InspectorSelect
        label={t("fl.fit")}
        value={value}
        options={
          options.some((option) => option.value === value)
            ? options
            : [{ value, label: value }, ...options]
        }
        onChange={(next) => {
          track("select", "Fit");
          onChange(next);
        }}
      />
    </FlatField>
  );
}
