// St-Framing: how the cut's video fills the canvas. "Mod" picks fill / fit / stretch, the
// cross of five buttons picks the anchor, and the footer copies both to every cut.
import {
  cutMediaElement,
  patchCutMediaSettings,
  type CutMediaSetting,
} from "../../utils/sourceCutMediaSettings";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";
import {
  InspectorAction,
  InspectorError,
  InspectorSection,
  InspectorSegment,
} from "./inspectorControls";
import { positionAnchor } from "./sourceCutAnchors";

type FitMode = "cover" | "contain" | "fill";
const FIT_MODES: readonly { value: FitMode; label: MessageKey }[] = [
  { value: "cover", label: "framing.cover" },
  { value: "contain", label: "framing.contain" },
  { value: "fill", label: "framing.fill" },
];

// Grid cell (column, row) of each anchor in the 3×3 cross.
const POSITIONS: readonly { value: string; label: MessageKey; col: number; row: number }[] = [
  { value: "top", label: "framing.top", col: 2, row: 1 },
  { value: "left", label: "framing.left", col: 1, row: 2 },
  { value: "center", label: "framing.center", col: 2, row: 2 },
  { value: "right", label: "framing.right", col: 3, row: 2 },
  { value: "bottom", label: "framing.bottom", col: 2, row: 3 },
];

function isFitMode(value: string): value is FitMode {
  return value === "cover" || value === "contain" || value === "fill";
}

export function SourceCutMediaSettings(props: SourceCutControlProps) {
  useLocale();
  const { source, busy, error, saveSourceCutChanges } = useSourceCutChanges(props);
  const media = source
    ? cutMediaElement(new DOMParser().parseFromString(source, "text/html"), "visual")
    : null;
  if (!media) return null;
  const fit = media.style.objectFit || "cover";
  const position = media.style.objectPosition || "center";
  const currentAnchor = positionAnchor(position);
  const save = (settings: CutMediaSetting[], all: boolean, name: string) =>
    saveSourceCutChanges({
      applyToAll: all,
      label: `${all ? "All cuts" : "Clip"}: ${name}`,
      patch: (html, target) => patchCutMediaSettings(html, target, "visual", settings),
    }).catch(() => {});
  const style = (name: string, value: string): CutMediaSetting => ({ type: "style", name, value });
  return (
    <InspectorSection title={t("framing.title")} label="Cut media settings">
      <div className="flex flex-col gap-2.5">
        <b className="text-[13px] font-semibold text-studio-text">{t("framing.mode")}</b>
        <InspectorSegment
          label={t("framing.mode")}
          value={isFitMode(fit) ? fit : "cover"}
          disabled={busy}
          options={FIT_MODES.map((mode) => ({ value: mode.value, label: t(mode.label) }))}
          onChange={(value) => void save([style("object-fit", value)], false, "object-fit")}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        <b className="text-[13px] font-semibold text-studio-text">{t("framing.position")}</b>
        <div
          role="group"
          aria-label={t("framing.position")}
          className="mx-auto grid grid-cols-[44px_44px_44px] grid-rows-[44px_44px_44px] gap-1.5"
        >
          {POSITIONS.map((anchor) => {
            const selected = anchor.value === currentAnchor;
            return (
              <button
                key={anchor.value}
                type="button"
                aria-label={t(anchor.label)}
                title={t(anchor.label)}
                aria-pressed={selected}
                disabled={busy}
                style={{ gridColumn: anchor.col, gridRow: anchor.row }}
                onClick={() =>
                  void save([style("object-position", anchor.value)], false, "object-position")
                }
                className={[
                  "flex items-center justify-center rounded-[10px] transition-colors disabled:opacity-45",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]",
                  selected
                    ? "bg-studio-selected text-studio-on-selected"
                    : "bg-studio-surface text-studio-muted shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]",
                ].join(" ")}
              >
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              </button>
            );
          })}
        </div>
      </div>
      <InspectorAction
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void save([style("object-fit", fit), style("object-position", position)], true, "framing")
        }
      >
        {t("framing.applyAll")}
      </InspectorAction>
      {error && <InspectorError>{error}</InspectorError>}
    </InspectorSection>
  );
}
