import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  sandboxArguments,
  sandboxThumbnail,
  startSandboxRender,
  startSandboxBackgroundRemoval,
} from "./sandbox";
import { initializeProject } from "./starter";

const sandboxTest = process.env.SNEEPCUT_TEST_SANDBOX === "1" ? test : test.skip;

sandboxTest(
  "namespace blocks host files, credentials and external network",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "sandbox-probe-"));
    try {
      await mkdir(join(root, "project"));
      const secret = join(tmpdir(), `secret-${crypto.randomUUID()}`);
      await writeFile(secret, "private");
      try {
        const script = `import { existsSync } from 'node:fs';
        if (existsSync(${JSON.stringify(secret)}) || existsSync('/data/projects')) throw Error('host file exposed');
        if (process.env.SANDBOX_TEST_SECRET) throw Error('environment exposed');
        let connected = false;
        try { await fetch('http://1.1.1.1', { signal: AbortSignal.timeout(1000) }); connected = true; } catch {}
        if (connected) throw Error('external network exposed');
        console.log('isolation verified');`;
        const args = sandboxArguments(root).slice(0, -2);
        const child = Bun.spawn(["/usr/bin/bwrap", ...args, "/usr/local/bin/bun", "-e", script], {
          env: { SANDBOX_TEST_SECRET: "private" },
          stdout: "pipe",
          stderr: "pipe",
        });
        const error = await new Response(child.stderr).text();
        expect(await child.exited, error).toBe(0);
        expect(await new Response(child.stdout).text()).toContain("isolation verified");
      } finally {
        await rm(secret);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  10000,
);

sandboxTest(
  "isolated thumbnail and MP4 render complete from a synthetic project",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "sandbox-render-"));
    const project = { id: "synthetic", dir };
    try {
      await initializeProject({ dir, title: "Sandbox test" });
      const html = await readFile(join(dir, "index.html"), "utf8");
      await writeFile(
        join(dir, "index.html"),
        html
          .replaceAll('data-duration="6"', 'data-duration="1"')
          .replace(
            'src="vendor/gsap.min.js"',
            'src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"',
          ),
      );
      const thumbnail = await sandboxThumbnail({
        project,
        compPath: "index.html",
        seekTime: 0.5,
        width: 1920,
        height: 1080,
        outputWidth: 320,
        outputHeight: 180,
        previewUrl: "http://preview.invalid:5191/api/projects/synthetic/preview/index.html",
        signal: new AbortController().signal,
      });
      expect(thumbnail.length).toBeGreaterThan(1000);
      const job = startSandboxRender({
        project,
        outputPath: join(dir, "renders", "test.mp4"),
        format: "mp4",
        fps: { num: 12, den: 1 },
        quality: "draft",
        jobId: "test",
      });
      while (job.status === "rendering") await Bun.sleep(100);
      expect(job.status, job.error).toBe("complete");
      const video = await readFile(job.outputPath);
      expect(video.subarray(4, 8).toString()).toBe("ftyp");
      const metadata = JSON.parse(await readFile(join(dir, "renders", "test.meta.json"), "utf8"));
      expect(metadata.status).toBe("complete");
      expect(metadata.durationMs).toBeGreaterThan(0);
      await writeFile(join(dir, "input.jpg"), thumbnail);
      const background = startSandboxBackgroundRemoval({
        project,
        inputPath: join(dir, "input.jpg"),
        inputAssetPath: "input.jpg",
        outputPath: join(dir, "foreground.png"),
        outputAssetPath: "foreground.png",
        quality: "fast",
        device: "cpu",
        jobId: "background",
      });
      while (background.status === "processing") await Bun.sleep(100);
      expect(background.status, background.error).toBe("complete");
      expect((await readFile(background.outputPath)).subarray(1, 4).toString()).toBe("PNG");
      const cancelled = startSandboxRender({
        project,
        outputPath: join(dir, "renders", "cancelled.mp4"),
        format: "mp4",
        fps: { num: 12, den: 1 },
        quality: "draft",
        jobId: "cancelled",
      });
      await Bun.sleep(500);
      cancelled.cancel?.();
      const deadline = Date.now() + 5000;
      while (cancelled.status === "rendering" && Date.now() < deadline) await Bun.sleep(100);
      expect(cancelled.status).toBe("cancelled");
      expect(await Bun.file(cancelled.outputPath).exists()).toBe(false);
      await symlink("/etc/passwd", join(dir, "escape"));
      const blocked = startSandboxRender({
        project,
        outputPath: join(dir, "renders", "blocked.mp4"),
        format: "mp4",
        fps: { num: 12, den: 1 },
        quality: "draft",
        jobId: "blocked",
      });
      while (blocked.status === "rendering") await Bun.sleep(100);
      expect(blocked.status).toBe("failed");
      expect(blocked.error).toContain("Unsupported project file");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  180000,
);
