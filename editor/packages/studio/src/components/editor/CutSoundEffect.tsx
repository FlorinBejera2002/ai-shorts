// St-Sound / St-Inspector-SoundPick / St-Inspector-SoundStates: the sound that plays at the
// start of the selected cut. Pick Click, Pop or Whoosh (each row can be heard first), set the
// effect volume, then apply it to this cut or to every cut. The applied effect's row offers
// "Elimină"; a failed save keeps the choice and offers "Reîncearcă".
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
import { t, useLocale } from "../../i18n/translate";
import type { DomEditSelection } from "./domEditingTypes";
import { useSourceCutChanges } from "./useSourceCutChanges";
import {
  ICON_PATHS,
  InspectorAction,
  InspectorError,
  InspectorIcon,
  InspectorPill,
  InspectorSection,
  InspectorSlider,
} from "./inspectorControls";

export function CutSoundEffect({
  selection,
  recordEdit,
}: {
  selection: DomEditSelection;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
}) {
  useLocale();
  const { source, busy, error, saveSourceCutChanges } = useSourceCutChanges({
    selection,
    recordEdit,
  });
  if (source === null) return error ? <InspectorError>{error}</InspectorError> : null;
  return (
    <CutSoundEffectForm
      key={`${selection.id}:${source}`}
      source={source}
      busy={busy}
      save={saveSourceCutChanges}
    />
  );
}

type ApplyRequest = { applyToAll: boolean; remove: boolean };

function useAudition() {
  const audition = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const stop = () => {
    audition.current?.audio.pause();
    if (audition.current) URL.revokeObjectURL(audition.current.url);
    audition.current = null;
  };
  useEffect(() => stop, []);
  return async (effect: CutSoundEffectId, volume: number) => {
    stop();
    const url = URL.createObjectURL(
      new Blob([createCutSoundEffectWav(effect)], { type: "audio/wav" }),
    );
    const audio = new Audio(url);
    audio.volume = volume;
    audition.current = { audio, url };
    await audio.play();
  };
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
  const lastRequest = useRef<ApplyRequest | null>(null);
  const play = useAudition();
  const disabled = busy || saving;

  async function listen(id: CutSoundEffectId) {
    setEffect(id);
    try {
      await play(id, volume);
    } catch {
      setError(t("sfx.playFailed"));
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

  async function apply({ applyToAll, remove }: ApplyRequest) {
    if (disabled) return;
    lastRequest.current = { applyToAll, remove };
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
      setStatus(remove ? t("sfx.removed") : t("sfx.applied"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The sound effect could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectorSection title={t("sfx.title")} label="Cut sound effect">
      <ul aria-label={t("sfx.sound")} className="flex flex-col gap-2">
        {CUT_SOUND_EFFECTS.map((preset) => (
          <SoundRow
            key={preset.id}
            name={preset.label}
            selected={preset.id === effect}
            applied={existing?.effect === preset.id}
            disabled={disabled}
            onSelect={() => setEffect(preset.id)}
            onListen={() => void listen(preset.id)}
            onRemove={() => void apply({ applyToAll: false, remove: true })}
          />
        ))}
      </ul>
      <InspectorSlider
        label={t("sfx.volume")}
        value={Math.round(volume * 100)}
        min={0}
        max={100}
        disabled={disabled}
        format={(value) => `${value}%`}
        onChange={(value) => setVolume(value / 100)}
      />
      {error && (
        <div className="flex items-center justify-between gap-2">
          <InspectorError>
            <span title={error}>{error}</span>
          </InspectorError>
          {lastRequest.current && (
            <InspectorPill
              disabled={disabled}
              onClick={() => lastRequest.current && void apply(lastRequest.current)}
            >
              {t("sfx.retry")}
            </InspectorPill>
          )}
        </div>
      )}
      {status && (
        <p role="status" className="sr-only">
          {status}
        </p>
      )}
      <div className="flex flex-col gap-2 pt-2">
        <InspectorAction
          variant="primary"
          disabled={disabled}
          onClick={() => void apply({ applyToAll: false, remove: false })}
        >
          {t("sfx.apply")}
        </InspectorAction>
        <InspectorAction
          variant="secondary"
          disabled={disabled}
          onClick={() => void apply({ applyToAll: true, remove: false })}
        >
          {t("sfx.applyAll")}
        </InspectorAction>
        <InspectorAction
          variant="danger"
          size="sm"
          disabled={disabled}
          onClick={() => void apply({ applyToAll: true, remove: true })}
        >
          {t("sfx.removeAll")}
        </InspectorAction>
      </div>
    </InspectorSection>
  );
}

function SoundRow({
  name,
  selected,
  applied,
  disabled,
  onSelect,
  onListen,
  onRemove,
}: {
  name: string;
  selected: boolean;
  applied: boolean;
  disabled: boolean;
  onSelect: () => void;
  onListen: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={[
        "flex min-h-[52px] items-center gap-2 rounded-md bg-studio-surface pr-2 pl-0",
        selected
          ? "shadow-[inset_0_0_0_2px_var(--st-tx)]"
          : "shadow-[inset_0_0_0_1.5px_var(--st-bd)]",
      ].join(" ")}
    >
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        className="flex min-h-[52px] min-w-0 flex-1 items-center rounded-md pl-3.5 text-left text-[13px] font-medium text-studio-text outline-none focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
      >
        {name}
      </button>
      {applied && (
        <InspectorPill disabled={disabled} onClick={onRemove} className="!text-studio-danger">
          {t("sfx.remove")}
        </InspectorPill>
      )}
      {selected && (
        <span className="text-studio-text">
          <InspectorIcon d={ICON_PATHS.check} />
        </span>
      )}
      <button
        type="button"
        aria-label={t("sfx.listenNamed", { name })}
        title={t("sfx.listen")}
        disabled={disabled}
        onClick={onListen}
        className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-sub)] disabled:opacity-45"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d={ICON_PATHS.play} />
        </svg>
      </button>
    </li>
  );
}
