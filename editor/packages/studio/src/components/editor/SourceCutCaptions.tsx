import { useId, useState } from "react";
import { CAPTION_ANIMATIONS } from "@hyperframes/core/caption-animations";
import {
  patchSourceCaptions,
  readSourceCaptionSettings,
  type SourceCaptionProperty,
  type SourceCaptionSettings,
} from "../../utils/sourceCutCaptions";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";

const LABELS = {
  none: "Off",
  "phrase-pop": "Phrase pop",
  "subtle-fade": "Phrase fade",
  "word-pop": "Word pop",
  "word-fade": "Word fade",
};
const controlClass =
  "min-h-10 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-100 disabled:opacity-40";

function CaptionSize({
  size,
  busy,
  save,
}: {
  size: number;
  busy: boolean;
  save: (value: number, all: boolean) => void;
}) {
  const [draft, setDraft] = useState(Math.round(size));
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs text-neutral-200">
        Subtitle size
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className={`${controlClass} min-w-0 flex-1`}
          type="number"
          min={8}
          max={400}
          step={1}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(Number(event.target.value))}
          onBlur={(event) => {
            if (
              event.relatedTarget?.getAttribute("data-caption-apply-all") !== id &&
              draft !== size
            )
              save(draft, false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          className={controlClass}
          disabled={busy}
          aria-label="Apply subtitle size to all cuts"
          data-caption-apply-all={id}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => save(draft, true)}
        >
          Apply to all
        </button>
      </div>
    </div>
  );
}

export function SourceCutCaptions(props: SourceCutControlProps) {
  const { source, parentSource, targets, busy, error, saveSourceCutChanges } =
    useSourceCutChanges(props);
  const selected = targets.filter(
    (target) => target.id === (props.selection.id ?? props.selection.element.id),
  );
  const settings =
    (source && readSourceCaptionSettings(source)) ||
    (parentSource && readSourceCaptionSettings(parentSource, selected));
  if (!settings) return null;
  const save = (
    property: SourceCaptionProperty,
    value: SourceCaptionSettings[SourceCaptionProperty],
    applyToAll = false,
  ) => {
    void saveSourceCutChanges({
      patch: (html) => patchSourceCaptions(html, property, value),
      patchParent: (html, selectedTargets) =>
        patchSourceCaptions(html, property, value, selectedTargets),
      label: `${applyToAll ? "All cuts" : "Clip"}: subtitle ${property}`,
      applyToAll,
    }).catch(() => {});
  };
  return (
    <section aria-label="Cut subtitles" className="space-y-3 border-b border-neutral-800 p-3">
      <h3 className="text-xs font-medium text-neutral-100">Subtitles</h3>
      <p className="text-[11px] text-neutral-400">
        Changes affect this cut. Use Apply to all to copy a setting.
      </p>
      <CaptionSize
        key={settings.size}
        size={settings.size}
        busy={busy}
        save={(value, all) => save("size", value, all)}
      />
      {(
        [
          ["outline", "Text outline"],
          ["background", "Text background"],
          ["activeWord", "Active word"],
        ] as const
      ).map(([property, label]) => (
        <div key={property} className="flex items-center justify-between gap-2">
          <label className="flex min-h-10 items-center gap-2 text-xs text-neutral-200">
            <input
              type="checkbox"
              checked={settings[property]}
              disabled={busy}
              onChange={(event) => save(property, event.target.checked)}
              className="accent-neutral-200"
            />
            {label}
            <span className="text-neutral-400">{settings[property] ? "On" : "Off"}</span>
          </label>
          <button
            type="button"
            className={controlClass}
            disabled={busy}
            aria-label={`Apply ${label.toLowerCase()} to all cuts`}
            onClick={() => save(property, settings[property], true)}
          >
            Apply to all
          </button>
        </div>
      ))}
      <label className="grid gap-1.5 text-xs text-neutral-200">
        Word entrance animation
        <select
          className={controlClass}
          disabled={busy}
          value={settings.animation}
          onChange={(event) => {
            const animation = CAPTION_ANIMATIONS.find((item) => item === event.target.value);
            if (animation) save("animation", animation);
          }}
        >
          {CAPTION_ANIMATIONS.map((animation) => (
            <option key={animation} value={animation}>
              {LABELS[animation]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={`${controlClass} w-full hover:bg-neutral-800`}
        disabled={busy}
        aria-label="Apply subtitle animation to all cuts"
        onClick={() => save("animation", settings.animation, true)}
      >
        Apply animation to all
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
