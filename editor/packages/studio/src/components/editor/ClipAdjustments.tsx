import { useId, useRef, useState } from "react";
import {
  patchClipAdjustment,
  readClipAdjustments,
  type ClipAdjustment,
} from "../../utils/clipAdjustments";
import { useSourceCutChanges, type SourceCutControlProps } from "./useSourceCutChanges";

interface AdjustmentSliderProps {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onSave: (value: number, all: boolean) => Promise<void>;
}

function AdjustmentSlider({ label, value, max, disabled, onSave }: AdjustmentSliderProps) {
  const id = useId();
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="text-neutral-200">
          {label}
        </label>
        <output htmlFor={id} className="tabular-nums text-neutral-400">
          {draft}%
        </output>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={0}
          max={max}
          step={1}
          value={draft}
          disabled={disabled}
          className="h-7 min-w-0 flex-1 accent-neutral-200"
          onChange={(event) => {
            const next = Number(event.target.value);
            latest.current = next;
            setDraft(next);
          }}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          onBlur={() => commit()}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`Apply ${label.toLowerCase()} to all cuts`}
          className="h-7 shrink-0 rounded-md border border-neutral-700 px-2 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          onClick={() => commit(true)}
        >
          Apply to all
        </button>
      </div>
    </div>
  );
}

export function ClipAdjustments(props: SourceCutControlProps) {
  const { source, busy, error, saveSourceCutChanges } = useSourceCutChanges(props);
  const settings = source ? readClipAdjustments(source) : null;
  const save = (property: ClipAdjustment, value: number | boolean, applyToAll: boolean) =>
    saveSourceCutChanges({
      patch: (html) => patchClipAdjustment(html, property, value),
      label: `${applyToAll ? "All cuts" : "Clip"}: ${property}`,
      applyToAll,
    });
  return (
    <section
      aria-label="Clip adjustments"
      className="shrink-0 space-y-3 border-b border-neutral-800 p-3"
    >
      <div>
        <h3 className="text-xs font-medium text-neutral-100">Clip adjustments</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
          Changes affect the selected cut. Apply each setting to all cuts only when needed.
        </p>
      </div>
      {!settings && !error && <p className="text-xs text-neutral-400">Loading clip settings…</p>}
      {settings && (
        <>
          {(["brightness", "contrast", "saturation", "sharpen"] as const).map((property) => (
            <AdjustmentSlider
              key={`${property}:${settings[property]}`}
              label={property[0].toUpperCase() + property.slice(1)}
              value={settings[property]}
              max={property === "sharpen" ? 100 : 200}
              disabled={busy}
              onSave={(value, all) => save(property, value, all)}
            />
          ))}
          {settings.hasAudio && (
            <>
              <AdjustmentSlider
                key={`volume:${settings.volume}`}
                label="Clip volume"
                value={settings.volume}
                max={100}
                disabled={busy}
                onSave={(value, all) => save("volume", value, all)}
              />
              <div className="flex items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 text-neutral-200">
                  <input
                    type="checkbox"
                    checked={settings.muted}
                    disabled={busy}
                    className="accent-neutral-200"
                    onChange={(event) =>
                      void save("muted", event.target.checked, false).catch(() => {})
                    }
                  />
                  Mute clip audio
                </label>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Apply clip mute to all cuts"
                  className="h-7 rounded-md border border-neutral-700 px-2 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
                  onClick={() => void save("muted", settings.muted, true).catch(() => {})}
                >
                  Apply to all
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
