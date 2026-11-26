// St-Subtitles / St-Inspector-SubAnim: the burned-in subtitles of the selected cut. Size,
// outline, background, active word and word animation save to this cut; the hover icon on a
// row copies that setting to every cut and "Aplică la toate" copies all of them at once.
import { useId, useState } from "react";
import { CAPTION_ANIMATIONS, type CaptionAnimation } from "@hyperframes/core/caption-animations";
import {
  patchSourceCaptions,
  readSourceCaptionSettings,
  type SourceCaptionProperty,
  type SourceCaptionSettings,
} from "../../utils/sourceCutCaptions";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";
import { ApplyAllIconButton } from "./CutApplyAllIcon";
import {
  ICON_PATHS,
  InspectorAction,
  InspectorError,
  InspectorIcon,
  InspectorRange,
  InspectorSection,
  InspectorSelect,
} from "./inspectorControls";
import { Switch } from "../ui";

const ANIMATION_LABELS: Record<CaptionAnimation, MessageKey> = {
  none: "subs.animNone",
  "phrase-pop": "subs.animPhrasePop",
  "subtle-fade": "subs.animPhraseFade",
  "word-pop": "subs.animWordPop",
  "word-fade": "subs.animWordFade",
};

const STYLE_SWITCHES = [
  ["outline", "subs.outline"],
  ["background", "subs.background"],
  ["activeWord", "subs.activeWord"],
] as const;

const ALL_PROPERTIES: readonly SourceCaptionProperty[] = [
  "size",
  "outline",
  "background",
  "activeWord",
  "animation",
];

type SaveCaption = (
  property: SourceCaptionProperty,
  value: SourceCaptionSettings[SourceCaptionProperty],
  applyToAll?: boolean,
) => void;

function CaptionSize({ size, busy, save }: { size: number; busy: boolean; save: SaveCaption }) {
  const [draft, setDraft] = useState(Math.round(size));
  const marker = useId();
  const label = t("subs.size");
  return (
    <div className="group flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="font-medium text-studio-text">{label}</span>
        <span className="flex items-center gap-1">
          <ApplyAllIconButton
            label={t("subs.applySizeAll")}
            marker={marker}
            disabled={busy}
            onClick={() => save("size", draft, true)}
          />
          <output className="font-semibold tabular-nums text-studio-muted">{draft}</output>
        </span>
      </div>
      <InspectorRange
        ariaLabel={label}
        value={draft}
        min={8}
        max={400}
        disabled={busy}
        onChange={setDraft}
        onCommit={(related) => {
          const toApplyAll =
            related instanceof Element && related.getAttribute("data-apply-all-marker") === marker;
          if (!toApplyAll && draft !== Math.round(size)) save("size", draft, false);
        }}
      />
    </div>
  );
}

function StyleSwitch({
  label,
  checked,
  busy,
  onChange,
  onApplyAll,
}: {
  label: string;
  checked: boolean;
  busy: boolean;
  onChange: (checked: boolean) => void;
  onApplyAll: () => void;
}) {
  return (
    <div className="group flex min-h-10 items-center justify-between gap-2">
      <span className="flex-1 text-[13px] font-medium text-studio-text">{label}</span>
      <ApplyAllIconButton
        label={t("cut.applyNamedAll", { name: label.toLowerCase() })}
        disabled={busy}
        onClick={onApplyAll}
      />
      <Switch label={label} checked={checked} disabled={busy} onChange={onChange} />
    </div>
  );
}

export function SourceCutCaptions(props: SourceCutControlProps) {
  useLocale();
  const { source, parentSource, targets, busy, error, saveSourceCutChanges } =
    useSourceCutChanges(props);
  const selected = targets.filter(
    (target) => target.id === (props.selection.id ?? props.selection.element.id),
  );
  const settings =
    (source && readSourceCaptionSettings(source)) ||
    (parentSource && readSourceCaptionSettings(parentSource, selected));
  if (!settings) return null;
  const save: SaveCaption = (property, value, applyToAll = false) => {
    void saveSourceCutChanges({
      patch: (html) => patchSourceCaptions(html, property, value),
      patchParent: (html, selectedTargets) =>
        patchSourceCaptions(html, property, value, selectedTargets),
      label: `${applyToAll ? "All cuts" : "Clip"}: subtitle ${property}`,
      applyToAll,
    }).catch(() => {});
  };
  const applyEverything = () => {
    const chain = (html: string, selectedTargets?: Parameters<typeof patchSourceCaptions>[3]) =>
      ALL_PROPERTIES.reduce(
        (next, property) =>
          patchSourceCaptions(next, property, settings[property], selectedTargets),
        html,
      );
    void saveSourceCutChanges({
      patch: (html) => chain(html),
      patchParent: (html, selectedTargets) => chain(html, selectedTargets),
      label: "All cuts: subtitles",
      applyToAll: true,
    }).catch(() => {});
  };
  return (
    <InspectorSection title={t("subs.title")} label="Cut subtitles">
      <CaptionSize key={settings.size} size={settings.size} busy={busy} save={save} />
      <div className="flex flex-col">
        <b className="pt-2 pb-1 text-[13px] font-semibold text-studio-text">{t("subs.style")}</b>
        {STYLE_SWITCHES.map(([property, label]) => (
          <StyleSwitch
            key={property}
            label={t(label)}
            checked={settings[property]}
            busy={busy}
            onChange={(checked) => save(property, checked)}
            onApplyAll={() => save(property, settings[property], true)}
          />
        ))}
      </div>
      <div className="group flex flex-col gap-2.5">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <b className="text-[13px] font-semibold text-studio-text">{t("subs.animation")}</b>
          <ApplyAllIconButton
            label={t("subs.applyAnimationAll")}
            disabled={busy}
            onClick={() => save("animation", settings.animation, true)}
          />
        </div>
        <InspectorSelect
          label={t("subs.animation")}
          value={settings.animation}
          disabled={busy}
          icon={<InspectorIcon d={ICON_PATHS.sparkle} />}
          options={CAPTION_ANIMATIONS.map((animation) => ({
            value: animation,
            label: t(ANIMATION_LABELS[animation]),
          }))}
          onChange={(animation) => save("animation", animation)}
        />
      </div>
      <InspectorAction variant="secondary" disabled={busy} onClick={applyEverything}>
        {t("subs.applyAll")}
      </InspectorAction>
      {error && <InspectorError>{error}</InspectorError>}
    </InspectorSection>
  );
}
