import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compositionHasManualChanges } from "./composition-edits";
import { workspaceRevision } from "./workspace";

test("preview identifiers and merge formatting do not turn an automatic clip into a manual edit", async () => {
  const root = await mkdtemp(join(tmpdir(), "composition-edits-"));
  const baseline = join(root, "baseline"),
    current = join(root, "current");
  const original =
    '<!doctype html><html><head><style>body{margin:0}#main{color:white}</style></head><body><div id="main" data-source-window>Original words</div></body></html>';
  const previewed =
    '<!doctype html>\n<html><head><style>body{margin:0}\n#main{color:white}</style></head><body><div data-hf-id="hf-test" id="main" data-source-window="">Original words</div></body></html>';
  try {
    await Promise.all([mkdir(baseline), mkdir(current)]);
    await writeFile(join(baseline, "index.html"), original);
    await writeFile(join(current, "index.html"), previewed);
    expect(await compositionHasManualChanges(baseline, current)).toBe(false);
    // Ignoring editor bookkeeping must never weaken byte-level CAS conflicts.
    expect(await workspaceRevision(baseline)).not.toBe(await workspaceRevision(current));
    for (const changed of [
      previewed.replace("Original words", "Edited words"),
      previewed.replace("color:white", "color:red"),
      previewed.replace('id="main"', 'id="main" data-duration="2"'),
      previewed.replace("</body>", "<script>window.changed=true</script></body>"),
    ]) {
      await writeFile(join(current, "index.html"), changed);
      expect(await compositionHasManualChanges(baseline, current)).toBe(true);
    }
    await writeFile(join(current, "index.html"), previewed);
    await writeFile(join(baseline, "media.mp4"), "original media");
    await writeFile(join(current, "media.mp4"), "edited media");
    expect(await compositionHasManualChanges(baseline, current)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
