import { useEffect, useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import type { RecordEditInput } from "../../utils/studioFileHistory";
import {
  CUT_SOUND_EFFECTS,
  createCutSoundEffectWav,
  cutSoundAssetRelativePath,
  patchCutSoundEffect,
  readCutSoundEffect,
  soundEffectFileName,
  type CutSoundEffectId,
} from "../../utils/cutSoundEffects";
import type { DomEditSelection } from "./domEditingTypes";
import { useSourceCutChanges } from "./useSourceCutChanges";

const BUTTON =
  "rounded-md border border-neutral-700 px-2 py-1.5 text-xs hover:bg-neutral-800 disabled:opacity-40";

export function CutSoundEffect({
  selection,
  recordEdit,
}: {
  selection: DomEditSelection;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
}) {
  const { source, busy, error, saveSourceCutChanges } = useSourceCutChanges({
    selection,
    recordEdit,
  });
  if (source === null)
    return error ? (
      <p role="alert" className="px-3 text-xs text-red-400">
        {error}
      </p>
    ) : null;
  return (
    <CutSoundEffectForm
      key={`${selection.id}:${source}`}
      source={source}
      busy={busy}
      save={saveSourceCutChanges}
    />
  );
}

function CutSoundEffectForm({
  source,
  busy,
  save,
}: {
  source: string;
  busy: boolean;
  save: ReturnType<typeof useSourceCutChanges>["saveSourceCutChanges"];
}) {
  const files = useFileManagerContext();
  const existing = readCutSoundEffect(source);
  const [effect, setEffect] = useState<CutSoundEffectId>(existing?.effect ?? "click");
  const [volume, setVolume] = useState(existing?.volume ?? 0.65);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const audition = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const disabled = busy || saving;
  useEffect(
    () => () => {
      audition.current?.audio.pause();
      if (audition.current) URL.revokeObjectURL(audition.current.url);
    },
    [],
  );

  async function listen() {
    audition.current?.audio.pause();
    if (audition.current) URL.revokeObjectURL(audition.current.url);
    const url = URL.createObjectURL(
      new Blob([createCutSoundEffectWav(effect)], { type: "audio/wav" }),
    );
    const audio = new Audio(url);
    audio.volume = volume;
    audition.current = { audio, url };
    try {
      await audio.play();
    } catch {
      setError("The sound preview could not play. Try again.");
    }
  }

  async function ensureAsset(): Promise<string> {
    const name = soundEffectFileName(effect);
    const path = `assets/${name}`;
    if (files.assets.includes(path)) return path;
    const projectId = files.projectIdRef.current;
    if (!projectId) throw new Error("Open a project before adding a sound effect.");
    const body = new FormData();
    body.append("file", new File([createCutSoundEffectWav(effect)], name, { type: "audio/wav" }));
    // Refresh the file tree without remounting the preview; the source save below
    // performs the composition refresh and records the undoable edit together.
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/upload?dir=assets`,
      { method: "POST", body },
    );
    const result = (await response.json()) as { files?: string[]; error?: string };
    if (!response.ok || !result.files?.[0])
      throw new Error(result.error || "The sound effect could not be saved.");
    await files.refreshFileTree();
    return result.files[0];
  }

  async function apply(applyToAll: boolean, remove = false) {
    if (disabled) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const assetPath = remove ? "" : await ensureAsset();
      await save({
        label: `${remove ? "Remove" : "Set"} cut sound effect${applyToAll ? " on all cuts" : ""}`,
        applyToAll,
        patch: (html, target) =>
          patchCutSoundEffect(
            html,
            remove
              ? null
              : {
                  effect,
                  volume,
                  assetPath: cutSoundAssetRelativePath(assetPath, target.path),
                },
          ),
      });
      setStatus(
        `${remove ? "Removed from" : "Applied to"} ${applyToAll ? "all cuts" : "selected cut"}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sound effect could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Cut sound effect" className="space-y-3 border-t border-neutral-800 p-3">
      <h3 className="text-xs font-medium text-neutral-200">Cut sound effect</h3>
      <p className="text-xs text-neutral-500">
        Plays at the start of this cut, including after trimming or moving it.
      </p>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-xs text-neutral-400">
          Sound
          <select
            aria-label="Cut sound"
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-neutral-200"
            disabled={disabled}
            value={effect}
            onChange={(event) => setEffect(event.target.value as CutSoundEffectId)}
          >
            {CUT_SOUND_EFFECTS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <button className={`${BUTTON} self-end`} disabled={disabled} onClick={() => void listen()}>
          Listen
        </button>
      </div>
      <label className="block text-xs text-neutral-400">
        Effect volume <span className="float-right">{Math.round(volume * 100)}%</span>
        <input
          aria-label="Effect volume"
          type="range"
          className="mt-2 w-full accent-neutral-200"
          min="0"
          max="100"
          step="1"
          disabled={disabled}
          value={Math.round(volume * 100)}
          onChange={(event) => setVolume(Number(event.target.value) / 100)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button className={BUTTON} disabled={disabled} onClick={() => void apply(false)}>
          Apply to selected cut
        </button>
        <button className={BUTTON} disabled={disabled} onClick={() => void apply(true)}>
          Apply to all cuts
        </button>
        <button
          className={BUTTON}
          disabled={disabled || !existing}
          onClick={() => void apply(false, true)}
        >
          Remove from selected cut
        </button>
        <button className={BUTTON} disabled={disabled} onClick={() => void apply(true, true)}>
          Remove from all cuts
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-xs text-neutral-400">
          {status}
        </p>
      )}
    </section>
  );
}
