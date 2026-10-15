import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getFfmpegBinary, processCompositionAudio } from "@hyperframes/engine";
import { MEDIA_RENDER_ID_ATTR } from "@hyperframes/core";
import { createCutSoundEffectWav } from "../../../studio/src/utils/cutSoundEffects";
import { collectRenderMedia } from "./renderMediaCollector";

const ffmpeg = getFfmpegBinary();
const available = (() => {
  try {
    execFileSync(ffmpeg, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!available)("cut sound delivered audio", () => {
  it("mixes generated WAVs at moved/trimmed cut boundaries and preserves their volume in MP4", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sneepcut-sfx-"));
    try {
      writeFileSync(join(dir, "whoosh.wav"), createCutSoundEffectWav("whoosh"));
      const html = [
        [0.5, 12, 0.25],
        [1.5, 45, 0.75],
      ]
        .map(
          ([start, sourceStart, volume], i) =>
            `<div data-composition-file="scene-${i}.html" data-source-window data-start="${start}" data-duration="0.8" data-playback-start="${sourceStart}" data-playback-rate="2">` +
            `<audio id="effect-${i}" ${MEDIA_RENDER_ID_ATTR}="effect-${i}" src="whoosh.wav" data-cut-boundary data-start="0" data-end="0.45" data-volume="${volume}"></audio></div>`,
        )
        .join("");
      const mix = join(dir, "audio.m4a");
      const result = await processCompositionAudio(
        collectRenderMedia(html).audios,
        dir,
        join(dir, "work"),
        mix,
        3,
      );
      expect(result.success, result.error).toBe(true);
      expect(result.failures ?? []).toEqual([]);
      expect(result.tracksProcessed).toBe(2);
      const delivered = join(dir, "delivered.mp4");
      execFileSync(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:r=24:d=3",
        "-i",
        mix,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-t",
        "3",
        delivered,
      ]);
      const decoded = execFileSync(
        ffmpeg,
        [
          "-v",
          "error",
          "-i",
          delivered,
          "-vn",
          "-ac",
          "1",
          "-ar",
          "48000",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { maxBuffer: 2_000_000 },
      );
      const rms = (start: number, end: number) => {
        let sum = 0;
        for (let i = Math.round(start * 48000); i < Math.round(end * 48000); i++)
          sum += decoded.readFloatLE(i * 4) ** 2;
        return Math.sqrt(sum / Math.round((end - start) * 48000));
      };
      const first = rms(0.5, 0.95);
      const second = rms(1.5, 1.95);
      expect(first).toBeGreaterThan(0.01);
      expect(second / first).toBeGreaterThan(2.8);
      expect(second / first).toBeLessThan(3.2);
      expect(rms(0.1, 0.45)).toBeLessThan(0.0001);
      expect(rms(1.05, 1.4)).toBeLessThan(0.0001);
      expect(rms(2.05, 2.8)).toBeLessThan(0.0001);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
