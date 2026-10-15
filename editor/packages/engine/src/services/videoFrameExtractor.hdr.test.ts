import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractAllVideoFrames, type VideoElement } from "./videoFrameExtractor.js";
import { lookupCacheEntry, markCacheEntryComplete, readKeyStat } from "./extractionCache.js";

const ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH ?? "ffmpeg";
const available = process.platform !== "darwin" && spawnSync(ffmpeg, ["-version"]).status === 0;
const toneMap =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=limited,format=yuv420p";

function rgb(file: string, crop: string, prefix = ""): number[] {
  const pixels = execFileSync(ffmpeg, [
    "-v",
    "error",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    `${prefix}${crop}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  expect(pixels.length).toBe(16 * 16 * 3);
  return [0, 1, 2].map((channel) => {
    let sum = 0;
    for (let index = channel; index < pixels.length; index += 3) sum += pixels[index]!;
    return sum / 256;
  });
}

describe.skipIf(!available)("HDR extraction pixels and old cache entries", () => {
  for (const transfer of ["arib-std-b67", "smpte2084", "bt709"]) {
    for (const format of transfer === "bt709" ? (["png"] as const) : (["png", "jpg"] as const)) {
      it(`converts ${transfer} ${format} correctly while preserving the matching warm cache`, async () => {
        const dir = mkdtempSync(join(tmpdir(), "hf-hdr-tone-map-"));
        try {
          const source = join(dir, "source.mp4");
          const isHdr = transfer !== "bt709";
          const primaries = isHdr ? "bt2020" : "bt709";
          const matrix = isHdr ? "bt2020nc" : "bt709";
          execFileSync(ffmpeg, [
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "nullsrc=s=160x90:r=30,format=yuv420p10le,geq=lum=512:cb='if(lt(X,W/2),256,768)':cr='if(lt(X,W/2),768,256)'",
            "-t",
            "0.4",
            "-c:v",
            "libx265",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p10le",
            "-color_primaries",
            primaries,
            "-color_trc",
            transfer,
            "-colorspace",
            matrix,
            "-color_range",
            "tv",
            "-x265-params",
            `pools=2:frame-threads=2:log-level=error:colorprim=${primaries}:transfer=${transfer}:colormatrix=${matrix}`,
            source,
          ]);
          const cache = join(dir, "cache");
          // Emulate a completed cache entry written before HDR tone mapping was
          // introduced, with the same source/trim/fps tuple and unconverted pixels.
          const old = lookupCacheEntry(cache, {
            videoPath: source,
            ...readKeyStat(source)!,
            mediaStart: 0,
            duration: 0.4,
            fps: "30",
            format,
          });
          mkdirSync(old.entry.dir, { recursive: true });
          execFileSync(ffmpeg, [
            "-v",
            "error",
            "-i",
            source,
            "-t",
            "0.4",
            "-vf",
            "fps=30",
            "-q:v",
            "2",
            join(old.entry.dir, `frame_%05d.${format}`),
          ]);
          markCacheEntryComplete(old.entry);
          const video: VideoElement = {
            id: "source",
            src: source,
            start: 0,
            end: 0.4,
            mediaStart: 0,
            loop: false,
            hasAudio: false,
          };
          const extract = (name: string) =>
            extractAllVideoFrames(
              [video],
              dir,
              { fps: 30, format, outputDir: join(dir, name) },
              undefined,
              { extractCacheDir: cache },
            );
          const first = await extract("first");
          expect(first.errors).toEqual([]);
          expect(first.phaseBreakdown.cacheHits).toBe(isHdr ? 0 : 1);
          expect(first.phaseBreakdown.cacheMisses).toBe(isHdr ? 1 : 0);
          const frame = first.extracted[0]!.framePaths.get(0)!;
          for (const crop of ["crop=16:16:iw/4:ih/2", "crop=16:16:3*iw/4:ih/2"]) {
            const expected = rgb(source, crop, isHdr ? `${toneMap},` : "");
            const actual = rgb(frame, crop);
            expect(
              Math.max(...actual.map((value, channel) => Math.abs(value - expected[channel]!))),
            ).toBeLessThanOrEqual(3);
          }
          const again = await extract("again");
          expect(again.errors).toEqual([]);
          expect(again.phaseBreakdown.cacheHits).toBe(1);
          expect(readFileSync(again.extracted[0]!.framePaths.get(0)!)).toEqual(readFileSync(frame));
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }, 30_000);
    }
  }
});
