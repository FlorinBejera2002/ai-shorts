import { readFile, writeFile } from "node:fs/promises";
import { createStudioServer } from "../../cli/src/server/studioServer";
import { captureThumbnail } from "./thumbnail";

if (process.env.SNEEPCUT_SANDBOX_CHILD !== "1")
  throw new Error("Sandbox worker cannot run outside isolation");
const request = JSON.parse(await readFile("/job/request.json", "utf8"));
if (request.kind === "probe") {
  const child = Bun.spawn(
    [
      "/usr/bin/ffprobe",
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "json",
      "/job/project/assets/clip.mp4",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const output = await new Response(child.stdout).json();
  if ((await child.exited) !== 0 || !Array.isArray(output.streams))
    throw new Error("Unable to inspect imported media");
  await writeFile("/job/result.json", JSON.stringify({ hasAudio: output.streams.length > 0 }));
  process.exit(0);
}
const server = createStudioServer({
  projectDir: "/job/project",
  projectName: request.options.project.id,
});
try {
  if (request.kind === "render") {
    const job = server.adapter.startRender(request.options);
    while (job.status === "rendering") {
      console.log(
        `STUDIO_PROGRESS ${JSON.stringify({ progress: job.progress, stage: job.stage })}`,
      );
      await Bun.sleep(250);
    }
    if (job.status !== "complete") throw new Error(job.error ?? "Render failed");
  } else if (request.kind === "thumbnail") {
    const image = await captureThumbnail(server.app, {
      ...request.options,
      signal: new AbortController().signal,
    });
    if (!image) throw new Error("Thumbnail failed");
    await writeFile("/job/result.image", image);
  } else if (request.kind === "background") {
    const job = server.adapter.startBackgroundRemoval!(request.options);
    while (job.status === "processing") {
      console.log(
        `STUDIO_PROGRESS ${JSON.stringify({ progress: job.progress, stage: job.stage })}`,
      );
      await Bun.sleep(250);
    }
    if (job.status !== "complete") throw new Error(job.error ?? "Background removal failed");
  } else throw new Error("Unknown sandbox operation");
} finally {
  server.watcher.close();
}
process.exit(0);
