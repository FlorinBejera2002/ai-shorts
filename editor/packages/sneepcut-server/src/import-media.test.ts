import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { remainingImportBudget } from "./import-media";

test("counts retained originals and every source once against the render-safe project budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "story-budget-"));
  try {
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets/source-1.mp4"), new Uint8Array(4));
    await writeFile(join(dir, "assets/original-export.mp4"), new Uint8Array(3));
    await writeFile(join(dir, "index.html"), "x");
    expect(await remainingImportBudget(dir, 10)).toBe(2);
    await writeFile(join(dir, "assets/original-source-1.mov"), new Uint8Array(4));
    await expect(remainingImportBudget(dir, 10)).rejects.toThrow("500 MiB project budget");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
