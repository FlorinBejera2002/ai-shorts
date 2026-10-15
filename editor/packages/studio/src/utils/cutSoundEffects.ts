export const CUT_SOUND_EFFECTS = [
  { id: "click", label: "Click", duration: 0.1 },
  { id: "pop", label: "Pop", duration: 0.22 },
  { id: "whoosh", label: "Whoosh", duration: 0.45 },
] as const;

export type CutSoundEffectId = (typeof CUT_SOUND_EFFECTS)[number]["id"];
export interface CutSoundEffectSettings {
  effect: CutSoundEffectId;
  volume: number;
  assetPath: string;
}

export function soundEffectFileName(effect: CutSoundEffectId): string {
  return `sneepcut-sfx-${effect}-v1.wav`;
}

/** Original synthesized effects: reproducible PCM, with no external audio assets. */
export function createCutSoundEffectWav(effect: CutSoundEffectId): Uint8Array<ArrayBuffer> {
  const preset = CUT_SOUND_EFFECTS.find((item) => item.id === effect);
  if (!preset) throw new Error("Choose a supported sound effect.");
  const sampleRate = 48_000;
  const samples = Math.round(preset.duration * sampleRate);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  let seed = 0x534e4545;
  let lowNoise = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const progress = i / (samples - 1);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    lowNoise += (noise - lowNoise) * (0.08 + progress * 0.4);
    const edgeFade = Math.min(1, i / 48, (samples - 1 - i) / 240);
    let signal: number;
    if (effect === "click") {
      signal = (0.6 * noise + 0.4 * Math.sin(2 * Math.PI * 2100 * t)) * Math.exp(-t * 85);
    } else if (effect === "pop") {
      const phase = 2 * Math.PI * (160 * t + (580 / 28) * (1 - Math.exp(-28 * t)));
      signal = Math.sin(phase) * Math.exp(-t * 22);
    } else {
      signal = lowNoise * Math.pow(Math.sin(Math.PI * progress), 1.5);
    }
    view.setInt16(44 + i * 2, Math.round(signal * edgeFade * 0.5 * 32767), true);
  }
  return bytes;
}

export function readCutSoundEffect(source: string): CutSoundEffectSettings | null {
  const document = new DOMParser().parseFromString(source, "text/html");
  const audio = document.querySelector("audio[data-cut-sfx]");
  const effect = audio?.getAttribute("data-cut-sfx");
  if (!CUT_SOUND_EFFECTS.some((item) => item.id === effect)) return null;
  const volume = Number(audio?.getAttribute("data-volume") ?? "0.65");
  return {
    effect: effect as CutSoundEffectId,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.65,
    assetPath: audio?.getAttribute("src") ?? "",
  };
}

/** Change only this feature's audio. Camera audio, captions and other tracks stay intact. */
export function patchCutSoundEffect(
  source: string,
  settings: CutSoundEffectSettings | null,
): string {
  const document = new DOMParser().parseFromString(source, "text/html");
  const root = document.querySelector("[data-composition-id]");
  if (!root) throw new Error("This cut has no editable source composition.");
  const existing = [...root.querySelectorAll("audio[data-cut-sfx]")];
  if (!settings) {
    if (existing.length === 0) return source;
    for (const audio of existing) audio.remove();
  } else {
    const preset = CUT_SOUND_EFFECTS.find((item) => item.id === settings.effect);
    if (!preset) throw new Error("Choose a supported sound effect.");
    const audio = existing.shift() ?? document.createElement("audio");
    for (const duplicate of existing) duplicate.remove();
    const volume = Number.isFinite(settings.volume)
      ? Math.min(1, Math.max(0, settings.volume))
      : 0.65;
    audio.id ||= `${root.getAttribute("data-composition-id") || "scene"}-cut-sfx`;
    audio.classList.add("clip");
    for (const [name, value] of Object.entries({
      src: settings.assetPath,
      preload: "auto",
      "data-cut-sfx": preset.id,
      "data-cut-boundary": "",
      "data-label": `${preset.label} sound effect`,
      "data-start": "0",
      "data-duration": String(preset.duration),
      "data-end": String(preset.duration),
      "data-media-start": "0",
      "data-playback-rate": "1",
      "data-volume": String(volume),
      "data-track-index": "2",
    }))
      audio.setAttribute(name, value);
    // A previously normalized end or playback-start must not override the new preset.
    for (const name of ["data-playback-start", "data-source-window-projected", "hidden", "muted"]) {
      audio.removeAttribute(name);
    }
    if (!audio.parentElement) root.append(audio);
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

/** Child compositions may be in a folder; media URLs are relative to their file. */
export function cutSoundAssetRelativePath(assetPath: string, compositionPath: string): string {
  const parts = compositionPath.replaceAll("\\", "/").split("/").filter(Boolean);
  return "../".repeat(Math.max(0, parts.length - 1)) + assetPath.replace(/^\/+/, "");
}
