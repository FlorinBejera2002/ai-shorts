// St-Main inspector: the selected cut (thumbnail, name, length and format), its image
// adjustments and its sound. Each control saves the selected cut on release; "Aplică la toate"
// copies the whole group to every cut, and the hover icon on a row copies that one setting.
import { useRef, useState } from "react";
import {
  patchClipAdjustment,
  readClipAdjustments,
  type ClipAdjustment,
  type ClipAdjustments as ClipAdjustmentValues,
  type ImageAdjustment,
} from "../../utils/clipAdjustments";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";
import { useIsPhone } from "../shell/useIsPhone";
import {
  InspectorAction,
  InspectorError,
  InspectorPill,
  InspectorRange,
  InspectorSection,
  InspectorSwitchRow,
} from "./inspectorControls";
import { ApplyAllIconButton } from "./CutApplyAllIcon";
import { CutIdentity } from "./CutIdentity";
import { formatAdjustment } from "./cutFormatting";

const IMAGE_ADJUSTMENTS: readonly { property: ImageAdjustment; label: MessageKey }[] = [
  { property: "brightness", label: "cut.brightness" },
  { property: "contrast", label: "cut.contrast" },
  { property: "saturation", label: "cut.saturation" },
  { property: "sharpen", label: "cut.sharpen" },
];

interface AdjustmentRowProps {
  property: ClipAdjustment;
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onSave: (value: number, all: boolean) => Promise<void>;
}

function AdjustmentRow({ property, label, value, max, disabled, onSave }: AdjustmentRowProps) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  const saving = useRef(false);
  const commit = (all = false) => {
    if (saving.current || disabled) return;
    if (!all && latest.current === value) return;
    saving.current = true;
    void onSave(latest.current, all)
      .catch(() => {
        setDraft(value);
        latest.current = value;
      })
      .finally(() => {
        saving.current = false;
      });
  };
  return (
    <div className="group flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="font-medium text-studio-text">{label}</span>
        <span className="flex items-center gap-1">
          <ApplyAllIconButton
            label={t("cut.applyNamedAll", { name: label.toLowerCase() })}
            disabled={disabled}
            onClick={() => commit(true)}
          />
          <output className="font-semibold tabular-nums text-studio-muted">
            {formatAdjustment(property, draft)}
          </output>
        </span>
      </div>
      <InspectorRange
        ariaLabel={label}
        value={draft}
        min={0}
        max={max}
        disabled={disabled}
        onChange={(next) => {
          latest.current = next;
          setDraft(next);
        }}
        onCommit={() => commit()}
      />
    </div>
  );
}

function historyLabel(name: string, applyToAll: boolean): string {
  return applyToAll ? t("cut.historyAll", { name }) : t("cut.historyClip", { name });
}

export function ClipAdjustments(props: SourceCutControlProps) {
  useLocale();
  const isPhone = useIsPhone();
  const { source, targets, busy, error, saveSourceCutChanges } = useSourceCutChanges(props);
  const selectedId = props.selection.id ?? props.selection.element.id;
  const duration = targets.find((target) => target.id === selectedId)?.duration;
  const settings = source ? readClipAdjustments(source) : null;
  const save = (property: ClipAdjustment, value: number | boolean, applyToAll: boolean) =>
    saveSourceCutChanges({
      patch: (html) => patchClipAdjustment(html, property, value),
      label: historyLabel(property, applyToAll),
      applyToAll,
    });
  const saveGroup = (values: ClipAdjustmentValues, properties: readonly ClipAdjustment[]) =>
    void saveSourceCutChanges({
      patch: (html) =>
        properties.reduce(
          (next, property) => patchClipAdjustment(next, property, values[property]),
          html,
        ),
      label: historyLabel(t("cut.historyAdjustments"), true),
      applyToAll: true,
    }).catch(() => {});
  const applyImageToAll = () => {
    if (settings)
      saveGroup(
        settings,
        IMAGE_ADJUSTMENTS.map((item) => item.property),
      );
  };
  return (
    <div className="flex min-w-0 flex-col gap-5" aria-label="Clip adjustments">
      <CutIdentity selection={props.selection} source={source} duration={duration} />
      {!settings && !error && (
        <p role="status" className="text-[13px] font-medium text-studio-muted">
          {t("cut.loading")}
        </p>
      )}
      {settings && (
        <InspectorSection
          title={t("cut.adjustments")}
          action={
            !isPhone && (
              <InspectorPill disabled={busy} onClick={applyImageToAll}>
                {t("cut.applyAll")}
              </InspectorPill>
            )
          }
        >
          <div className="flex flex-col gap-2.5 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-4">
            {IMAGE_ADJUSTMENTS.map(({ property, label }) => (
              <AdjustmentRow
                key={`${property}:${settings[property]}`}
                property={property}
                label={t(label)}
                value={settings[property]}
                max={property === "sharpen" ? 100 : 200}
                disabled={busy}
                onSave={(value, all) => save(property, value, all)}
              />
            ))}
          </div>
          {isPhone && (
            // St-M-ClipSheet: the group action is a full-width button under the grid.
            <InspectorAction variant="secondary" disabled={busy} onClick={applyImageToAll}>
              {t("cut.applyAll")}
            </InspectorAction>
          )}
        </InspectorSection>
      )}
      {settings?.hasAudio && (
        <InspectorSection
          title={t("cut.sound")}
          label={t("cut.sound")}
          action={
            <InspectorPill
              disabled={busy}
              aria-label={t("cut.applyNamedAll", { name: t("cut.sound").toLowerCase() })}
              onClick={() => saveGroup(settings, ["volume", "muted"])}
            >
              {t("cut.applyAll")}
            </InspectorPill>
          }
        >
          <AdjustmentRow
            key={`volume:${settings.volume}`}
            property="volume"
            label={t("cut.volume")}
            value={settings.volume}
            max={100}
            disabled={busy}
            onSave={(value, all) => save("volume", value, all)}
          />
          <InspectorSwitchRow
            label={t("cut.mute")}
            checked={settings.muted}
            disabled={busy}
            onChange={(checked) => void save("muted", checked, false).catch(() => {})}
          />
        </InspectorSection>
      )}
      {error && <InspectorError>{error}</InspectorError>}
    </div>
  );
}
