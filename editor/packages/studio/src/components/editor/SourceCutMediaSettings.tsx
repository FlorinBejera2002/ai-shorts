import {
  cutMediaElement,
  patchCutMediaSettings,
  type CutMediaSetting,
} from "../../utils/sourceCutMediaSettings";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";

const CONTROL =
  "min-h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200 disabled:opacity-40";

export function SourceCutMediaSettings(props: SourceCutControlProps) {
  const { source, busy, error, saveSourceCutChanges } = useSourceCutChanges(props);
  const media = source
    ? cutMediaElement(new DOMParser().parseFromString(source, "text/html"), "visual")
    : null;
  if (!media) return null;
  const save = (setting: CutMediaSetting, all: boolean) =>
    saveSourceCutChanges({
      applyToAll: all,
      label: `${all ? "All cuts" : "Clip"}: ${setting.name}`,
      patch: (html, target) => patchCutMediaSettings(html, target, "visual", [setting]),
    }).catch(() => {});
  const fields = [
    {
      label: "Fit",
      name: "object-fit",
      value: media.style.objectFit || "cover",
      options: ["cover", "contain", "fill"],
    },
    {
      label: "Position",
      name: "object-position",
      value: media.style.objectPosition || "center",
      options: ["center", "top", "bottom", "left", "right"],
    },
  ];
  return (
    <section aria-label="Cut media settings" className="space-y-3 border-b border-neutral-800 p-3">
      <h3 className="text-xs font-medium text-neutral-100">Framing</h3>
      {fields.map((field) => (
        <div key={field.name} className="flex items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-xs text-neutral-300">
            {field.label}
            <select
              aria-label={`Cut ${field.label.toLowerCase()}`}
              value={field.value}
              disabled={busy}
              className={`${CONTROL} block w-full`}
              onChange={(event) =>
                void save({ type: "style", name: field.name, value: event.target.value }, false)
              }
            >
              {[...new Set([...field.options, field.value])].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            className={`${CONTROL} hover:bg-neutral-800`}
            aria-label={`Apply ${field.label.toLowerCase()} to all cuts`}
            onClick={() => void save({ type: "style", name: field.name, value: field.value }, true)}
          >
            Apply to all
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
