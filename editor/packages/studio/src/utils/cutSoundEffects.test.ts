// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  CUT_SOUND_EFFECTS,
  createCutSoundEffectWav,
  cutSoundAssetRelativePath,
  patchCutSoundEffect,
  readCutSoundEffect,
} from "./cutSoundEffects";

const source = `<!doctype html><html><body><div data-composition-id="scene-one">
<video id="camera" src="camera.mp4" data-start="0" data-duration="40"></video>
<audio id="camera-audio" src="camera.mp4" data-start="0" data-duration="40" data-volume="0.8"></audio>
<div id="captions">Words</div></div></body></html>`;

describe("original cut sound presets", () => {
  for (const preset of CUT_SOUND_EFFECTS) {
    it(`creates reproducible valid PCM for ${preset.id} with quiet edges and headroom`, () => {
      const bytes = createCutSoundEffectWav(preset.id);
      expect(bytes).toEqual(createCutSoundEffectWav(preset.id));
      const header = new DataView(bytes.buffer);
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
      expect(new TextDecoder().decode(bytes.slice(8, 16))).toBe("WAVEfmt ");
      expect(header.getUint32(4, true)).toBe(bytes.length - 8);
      expect(header.getUint16(20, true)).toBe(1);
      expect(header.getUint16(22, true)).toBe(1);
      expect(header.getUint32(24, true)).toBe(48000);
      expect(header.getUint16(34, true)).toBe(16);
      expect(header.getUint32(40, true)).toBe(Math.round(48000 * preset.duration) * 2);
      let energy = 0;
      let peak = 0;
      for (let offset = 44; offset < bytes.length; offset += 2) {
        const sample = header.getInt16(offset, true) / 32768;
        energy += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      expect(Math.sqrt(energy / ((bytes.length - 44) / 2))).toBeGreaterThan(0.025);
      expect(peak).toBeLessThanOrEqual(0.5);
      expect(header.getInt16(44, true)).toBe(0);
      expect(header.getInt16(bytes.length - 2, true)).toBe(0);
    });
  }
});

describe("cut sound source persistence", () => {
  it("adds a cut-relative exported audio track without changing camera or captions", () => {
    const changed = patchCutSoundEffect(source, {
      effect: "whoosh",
      volume: 0.4,
      assetPath: "assets/whoosh.wav",
    });
    const doc = new DOMParser().parseFromString(changed, "text/html");
    expect(doc.querySelector("#camera-audio")?.getAttribute("data-volume")).toBe("0.8");
    expect(doc.querySelector("#captions")?.textContent).toBe("Words");
    const effect = doc.querySelector("audio[data-cut-sfx]")!;
    expect(effect.hasAttribute("data-cut-boundary")).toBe(true);
    expect(effect.getAttribute("data-start")).toBe("0");
    expect(effect.getAttribute("data-media-start")).toBe("0");
    expect(effect.getAttribute("data-duration")).toBe("0.45");
    expect(readCutSoundEffect(changed)).toEqual({
      effect: "whoosh",
      volume: 0.4,
      assetPath: "assets/whoosh.wav",
    });
  });

  it("replaces, removes and restores one effect without duplicating tracks", () => {
    const first = patchCutSoundEffect(source, {
      effect: "click",
      volume: 0.4,
      assetPath: "assets/click.wav",
    });
    const second = patchCutSoundEffect(first, {
      effect: "pop",
      volume: 0.8,
      assetPath: "assets/pop.wav",
    });
    expect(
      new DOMParser().parseFromString(second, "text/html").querySelectorAll("audio[data-cut-sfx]"),
    ).toHaveLength(1);
    expect(readCutSoundEffect(second)?.effect).toBe("pop");
    const removed = patchCutSoundEffect(second, null);
    expect(readCutSoundEffect(removed)).toBeNull();
    expect(
      new DOMParser().parseFromString(removed, "text/html").querySelector("#camera-audio"),
    ).not.toBeNull();
    expect(patchCutSoundEffect(removed, null)).toBe(removed);
    expect(readCutSoundEffect(first)?.effect).toBe("click");
  });

  it("resolves uploaded assets relative to a nested scene file", () => {
    expect(cutSoundAssetRelativePath("assets/effect.wav", "source-scene-1.html")).toBe(
      "assets/effect.wav",
    );
    expect(cutSoundAssetRelativePath("assets/effect.wav", "scenes/source-scene-1.html")).toBe(
      "../assets/effect.wav",
    );
  });
});
