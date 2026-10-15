import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveRenderOutput, sandboxArguments } from "./sandbox";

test("sandbox passes a bounded CPU budget through the cleared environment", () => {
  const previous = process.env.HYPERFRAMES_RENDER_CPU_LIMIT;
  try {
    for (const budget of ["1", "2", "64"]) {
      process.env.HYPERFRAMES_RENDER_CPU_LIMIT = budget;
      const args = sandboxArguments("/isolated/job");
      expect(args[args.indexOf("HYPERFRAMES_RENDER_CPU_LIMIT") - 1]).toBe("--setenv");
      const selected = Number(args[args.indexOf("HYPERFRAMES_RENDER_CPU_LIMIT") + 1]);
      expect(selected).toBeGreaterThanOrEqual(1);
      expect(selected).toBeLessThanOrEqual(Math.min(2, Number(budget)));
      expect(args).toContain("--clearenv");
      expect(args).toContain("--unshare-all");
      expect(args).not.toContain("/sys/fs/cgroup");
    }
  } finally {
    if (previous === undefined) delete process.env.HYPERFRAMES_RENDER_CPU_LIMIT;
    else process.env.HYPERFRAMES_RENDER_CPU_LIMIT = previous;
  }
});

test("sandbox render output streams the complete file and rejects empty output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "studio-output-test-"));
  try {
    const source = join(directory, "video.mp4");
    const bytes = Buffer.alloc(256 * 1024, 0x5a);
    await writeFile(source, bytes);
    const destination = join(directory, "renders", "video.mp4");
    await saveRenderOutput(source, destination);
    expect(await readFile(destination)).toEqual(bytes);
    await writeFile(source, "");
    await expect(saveRenderOutput(source, destination)).rejects.toThrow("Invalid sandbox output");
    expect(await readFile(destination)).toEqual(bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
