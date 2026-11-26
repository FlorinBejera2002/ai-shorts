// Effect palette (St-Inspector-Palette): preset palettes, the "Paletă personalizată" switch,
// editable colour swatches with add and remove, and "Folosește paleta implicită".
import {
  HF_COLOR_GRADING_PALETTES,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { t } from "../../i18n/translate";
import { lookText } from "./propertyPanelColorLabels";
import { LOOK_ICONS, LookIconButton, LookTitle } from "./propertyPanelColorLookUi";

const MAX_COLORS = 6;
const FALLBACK: Record<"mono" | "art", string[]> = {
  art: ["#1a1a1a", "#f5f5dc"],
  mono: ["#000000", "#ffffff"],
};

export function FlatEffectPalette({
  kind,
  grading,
  onCommitColorGrading,
}: {
  kind: "mono" | "art";
  grading: NormalizedHfColorGrading;
  onCommitColorGrading: (next: NormalizedHfColorGrading) => void;
}) {
  const track = useTrackDesignInput();
  const palette = grading.palette;
  const setPalette = (next: string[] | null) => onCommitColorGrading({ ...grading, palette: next });

  return (
    <div data-flat-effects-palette="true" className="flex flex-col gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-studio-text">{t("look.palette.custom")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(palette)}
          aria-label={t("look.palette.custom")}
          data-flat-effects-add-palette={palette ? undefined : "true"}
          onClick={() => {
            if (palette) {
              setPalette(null);
              return;
            }
            track("button", "Customize effect palette");
            setPalette(FALLBACK[kind]);
          }}
          className={`relative inline-flex h-6 w-10 flex-none items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${
            palette ? "bg-studio-accent" : "bg-[var(--st-hd)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`block h-[18px] w-[18px] rounded-full transition-transform ${
              palette
                ? "translate-x-[19px] bg-studio-on-accent"
                : "translate-x-[3px] bg-studio-surface"
            }`}
          />
        </button>
      </div>
      {palette && (
        <>
          <LookTitle>{t("look.palette.colors")}</LookTitle>
          <div
            role="group"
            aria-label={t("look.palette.colors")}
            className="flex flex-wrap items-center gap-3"
          >
            {palette.map((color, index) => (
              <span key={`${index}-${color}`} className="group/swatch relative">
                <input
                  type="color"
                  aria-label={t("look.palette.color", { n: index + 1 })}
                  value={color}
                  onChange={(event) => {
                    const next = [...palette];
                    next[index] = event.target.value;
                    setPalette(next);
                  }}
                  className="block h-8 w-8 cursor-pointer appearance-none rounded-sm border-0 bg-transparent p-0 shadow-[inset_0_0_0_1px_var(--st-bd)] [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                />
                {palette.length > 2 && (
                  <button
                    type="button"
                    aria-label={t("look.palette.removeColor", { n: index + 1 })}
                    onClick={() => setPalette(palette.filter((_, i) => i !== index))}
                    className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-studio-surface text-studio-text shadow-studio group-hover/swatch:flex focus-visible:flex"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="10" height="10">
                      <path d={LOOK_ICONS.close} stroke="currentColor" strokeWidth="2.5" />
                    </svg>
                  </button>
                )}
              </span>
            ))}
            {palette.length < MAX_COLORS && (
              <LookIconButton
                label={t("look.palette.add")}
                icon={LOOK_ICONS.plus}
                onClick={() => setPalette([...palette, palette.at(-1) ?? "#ffffff"])}
              />
            )}
            {palette.length > 2 && (
              <LookIconButton
                label={t("look.palette.removeLast")}
                icon={LOOK_ICONS.trash}
                onClick={() => setPalette(palette.slice(0, -1))}
              />
            )}
          </div>
          <button
            type="button"
            title={t("look.palette.default")}
            onClick={() => setPalette(null)}
            className="h-9 self-center rounded-full px-4 text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)]"
          >
            {t("look.palette.default")}
          </button>
        </>
      )}
      <LookTitle>{t("look.palette.presets")}</LookTitle>
      <div className="grid grid-cols-3 gap-2">
        {HF_COLOR_GRADING_PALETTES.map((preset) => {
          const selected =
            palette?.length === preset.colors.length &&
            palette.every((color, index) => color === preset.colors[index]);
          return (
            <button
              key={preset.id}
              type="button"
              title={`${lookText(preset.group)}: ${lookText(preset.label)}`}
              data-flat-effects-palette-preset={preset.id}
              aria-pressed={selected}
              onClick={() => {
                track("button", `Use ${preset.label} palette`);
                setPalette([...preset.colors]);
              }}
              className={`flex min-w-0 flex-col gap-1.5 rounded-md bg-studio-surface p-2 text-left transition-shadow ${
                selected
                  ? "shadow-[0_0_0_2px_var(--st-tx)]"
                  : "shadow-[inset_0_0_0_1px_var(--st-bd)] hover:shadow-[0_0_0_1.5px_var(--st-sbd)]"
              }`}
            >
              <span className="flex h-4 overflow-hidden rounded-sm">
                {preset.colors.map((color) => (
                  <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="block truncate text-[11px] font-medium text-studio-text">
                {lookText(preset.label)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
