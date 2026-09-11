import { mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative as relativePath, toNamespacedPath } from "node:path";
import { spawnSync } from "node:child_process";

const [ffmpeg, ffprobe] = process.argv.slice(2);
if (!ffmpeg || !ffprobe)
  throw new Error("Usage: bun verification/long-path-probe.ts <ffmpeg.exe> <ffprobe.exe>");
const root = await mkdtemp(join(tmpdir(), "sneepcut-longpath-probe-"));
try {
  const output = join(root, "a".repeat(80), "b".repeat(80), "c".repeat(50), "synthetic.mp4");
  await mkdir(dirname(output), { recursive: true });
  const encoded = spawnSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=16x16:r=1",
      "-frames:v",
      "1",
      "-c:v",
      "libx264",
      output,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  console.log(
    JSON.stringify({
      phase: "encode",
      status: encoded.status,
      error: encoded.stderr,
      pathLength: output.length,
      bytes: (await stat(output)).size,
    }),
  );
  const args = ["-v", "error", "-show_entries", "format=duration", "-of", "json", "--"];
  const absolute = spawnSync(ffprobe, [...args, output], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  const relative = spawnSync(ffprobe, [...args, basename(output)], {
    cwd: dirname(output),
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  const ancestor = spawnSync(ffprobe, [...args, relativePath(root, output)], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  const namespace = spawnSync(ffprobe, [...args, toNamespacedPath(output)], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  console.log(
    JSON.stringify({
      phase: "probe",
      absolute: {
        status: absolute.status,
        stdout: absolute.stdout,
        stderr: absolute.stderr,
        error: String(absolute.error ?? ""),
      },
      relative: {
        status: relative.status,
        stdout: relative.stdout,
        stderr: relative.stderr,
        error: String(relative.error ?? ""),
      },
    }),
  );
  console.log(
    JSON.stringify({
      phase: "alternatives",
      ancestor: {
        status: ancestor.status,
        stdout: ancestor.stdout,
        stderr: ancestor.stderr,
        error: String(ancestor.error ?? ""),
      },
      namespace: {
        status: namespace.status,
        stdout: namespace.stdout,
        stderr: namespace.stderr,
        error: String(namespace.error ?? ""),
      },
    }),
  );
  if (encoded.status !== 0 || (ancestor.status !== 0 && namespace.status !== 0))
    process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
