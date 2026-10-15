import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import {
  compileCanonicalComposition,
  type CanonicalCompositionPlan,
} from "./canonical-composition";
import { mergeCanonicalFiles, mergeCompositionProject } from "./canonical-merge";

describe("canonical merge asset replacements", () => {
  test("merges authored font-face declarations with a regenerated font source", () => {
    const html = (family: string, source: string) =>
      `<!doctype html><html><head><style>@font-face{font-family:${family};src:url("${source}");font-display:block}</style></head><body><div id="title">Caption</div></body></html>`;
    const base = new Map([["index.html", html("Automatic", "old.ttf")]]);
    const current = new Map([["index.html", html("Manual", "old.ttf")]]);
    const generated = new Map([["index.html", html("Automatic", "new.ttf")]]);
    const result = mergeCanonicalFiles(base, current, generated).files.get("index.html")!;
    expect(result).toContain("font-family:Manual");
    expect(result).toContain('src:url("new.ttf")');
    expect(result).toContain("font-display:block");
  });

  test("preserves same-path manual media replacement through repeated regeneration", async () => {
    const temporary = fileURLToPath(new URL("../../../../.cache/tmp/", import.meta.url));
    await mkdir(temporary, { recursive: true });
    const scratch = await mkdtemp(join(temporary, "canonical-asset-merge-"));
    if (!scratch.startsWith(join(temporary, "canonical-asset-merge-")))
      throw new Error("Unexpected fixture cleanup path");
    try {
      const plan: CanonicalCompositionPlan = {
        schema_version: 1,
        title: "Manual media replacement",
        width: 320,
        height: 180,
        duration: 2,
        dynamic_range: "sdr",
        assets: [
          { id: "camera", name: "Camera", kind: "video", url: "/media/camera.mp4", duration: 2 },
        ],
        scenes: [{ id: "block", asset_id: "camera", start: 0, duration: 2, source_in: 0 }],
        audio: [],
        overlays: [
          {
            id: "title",
            text: "First title",
            start: 0,
            duration: 2,
            x: 0,
            y: 0,
            width: 320,
            height: 40,
          },
        ],
      };
      const writeProject = async (directory: string, bytes: string) => {
        const files = compileCanonicalComposition(
          plan,
          new Map([["camera", "assets/camera.mp4"]]),
        ).files;
        files.set("assets/camera.mp4", bytes);
        for (const [path, source] of files) {
          await mkdir(dirname(join(directory, path)), { recursive: true });
          await writeFile(join(directory, path), source);
        }
      };
      const baseDir = join(scratch, "base"),
        currentDir = join(scratch, "current"),
        generatedDir = join(scratch, "generated");
      await writeProject(baseDir, "ORIGINAL FOOTAGE");
      await writeProject(currentDir, "MANUAL REPLACEMENT FOOTAGE");
      await writeProject(generatedDir, "ORIGINAL FOOTAGE");
      const outputDir = join(scratch, "first"),
        baselineOutputDir = join(scratch, "first-baseline");
      const effective = await mergeCompositionProject({
        baseDir,
        currentDir,
        generatedDir,
        outputDir,
        baselineOutputDir,
      });
      const sourcePath = async (directory: string) =>
        parseHTML(await readFile(join(directory, "source-scene-1.html"), "utf8"))
          .document.querySelector("video.source-video")!
          .getAttribute("src")!;
      const firstSource = await sourcePath(outputDir);
      expect(firstSource).toMatch(/^assets\/manual-/);
      expect(await readFile(join(outputDir, firstSource), "utf8")).toBe(
        "MANUAL REPLACEMENT FOOTAGE",
      );
      const baselineSource = await sourcePath(baselineOutputDir);
      expect(await readFile(join(baselineOutputDir, baselineSource), "utf8")).toBe(
        "ORIGINAL FOOTAGE",
      );
      expect(effective.manually_edited).toBe(true);

      plan.overlays![0]!.text = "Updated automatic title";
      await writeProject(generatedDir, "NEW AUTOMATIC FOOTAGE");
      const secondDir = join(scratch, "second");
      await mergeCompositionProject({
        baseDir: baselineOutputDir,
        currentDir: outputDir,
        generatedDir,
        outputDir: secondDir,
        baselineOutputDir: join(scratch, "second-baseline"),
      });
      expect(await sourcePath(secondDir)).toBe(firstSource);
      expect(await readFile(join(secondDir, firstSource), "utf8")).toBe(
        "MANUAL REPLACEMENT FOOTAGE",
      );
      expect(await readFile(join(secondDir, "index.html"), "utf8")).toContain(
        "Updated automatic title",
      );
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
