// St-Inspector-CutApply: "Aplică la toate tăieturile". One row per media setting with its
// current value; the layers icon copies only that setting to every cut, leaving the others.
import type { ReactNode } from "react";
import { ApplyCutSettingToAll } from "./CutSettingsScope";
import { useCutSettingsScope } from "./cutSettingsScopeContext";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { InspectorError, InspectorPill } from "./inspectorControls";

type AttributeRow = { key: MessageKey; name: string; format: (raw: string | null) => string };

const yesNo = (raw: string | null) => t(raw !== null && raw !== "false" ? "more.yes" : "more.no");

const ATTRIBUTE_ROWS: readonly AttributeRow[] = [
  {
    key: "more.volume",
    name: "data-volume",
    format: (raw) => `${Math.round((raw === null ? 1 : Number(raw) || 0) * 100)}%`,
  },
  {
    key: "more.rate",
    name: "data-playback-rate",
    format: (raw) => `${(raw === null ? 1 : Number(raw) || 1).toFixed(1)}×`,
  },
  {
    key: "more.mediaStart",
    name: "data-media-start",
    format: (raw) => {
      const seconds = Math.max(0, Math.round(Number(raw) || 0));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    },
  },
  {
    key: "more.loop",
    name: "loop",
    format: (raw) => t(raw !== null ? "more.enabled" : "more.disabled"),
  },
  { key: "more.muted", name: "muted", format: yesNo },
  { key: "more.audioTrack", name: "data-has-audio", format: yesNo },
];

// English names keep the history labels and aria labels stable across languages.
const ENGLISH_NAME: Partial<Record<string, string>> = {
  "data-volume": "Volume",
  "data-playback-rate": "Rate",
  "data-media-start": "Media start",
  loop: "Loop",
  muted: "Mute",
  "data-has-audio": "Audio track",
};

function SettingRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 text-[13px]">
      <span className="flex-1 font-medium text-studio-text">{label}</span>
      <span className="font-semibold tabular-nums text-studio-text">{value}</span>
      {children}
    </div>
  );
}

/** Each button copies only the named setting, leaving every other cut value intact. */
export function CutMediaApplyControls() {
  useLocale();
  const scope = useCutSettingsScope();
  if (!scope) return null;
  const element = scope.selection.element;
  const isVideo = element.tagName.toLowerCase() === "video";
  return (
    <section aria-label={t("more.applyAllTitle")} className="flex flex-col gap-1 pt-2">
      <b className="min-h-6 text-[13px] font-semibold text-studio-text">
        {t("more.applyAllTitle")}
      </b>
      {isVideo && (
        <div className="flex flex-col gap-1 py-1">
          <InspectorPill
            disabled={scope.busy}
            className="!h-auto min-h-8 !whitespace-normal py-1.5 text-left"
            onClick={() => void scope.applyPresentationToAll().catch(() => {})}
          >
            {t("more.applyStyling")}
          </InspectorPill>
        </div>
      )}
      {ATTRIBUTE_ROWS.map((row) => (
        <SettingRow
          key={row.name}
          label={t(row.key)}
          value={row.format(element.getAttribute(row.name))}
        >
          <ApplyCutSettingToAll
            label={ENGLISH_NAME[row.name] ?? row.name}
            displayLabel={t(row.key)}
            settings={[
              { type: "attribute", name: row.name, value: element.getAttribute(row.name) },
              ...(row.name === "data-has-audio"
                ? [
                    {
                      type: "attribute" as const,
                      name: "muted",
                      value: element.getAttribute("muted"),
                    },
                  ]
                : []),
            ]}
          />
        </SettingRow>
      ))}
      {isVideo &&
        (["object-fit", "object-position"] as const).map((name) => (
          <SettingRow
            key={name}
            label={t(name === "object-fit" ? "more.fit" : "more.position")}
            value={element.style.getPropertyValue(name) || "—"}
          >
            <ApplyCutSettingToAll
              label={name}
              displayLabel={t(name === "object-fit" ? "more.fit" : "more.position")}
              settings={[
                { type: "style", name, value: element.style.getPropertyValue(name) || null },
              ]}
            />
          </SettingRow>
        ))}
      {scope.error && <InspectorError>{scope.error}</InspectorError>}
    </section>
  );
}
