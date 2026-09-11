import { readFile, writeFile } from "node:fs/promises";
import { createStudioServer } from "../../cli/src/server/studioServer";
import { captureThumbnail } from "./thumbnail";

if (process.env.SNEEPCUT_SANDBOX_CHILD !== "1")
  throw new Error("Sandbox worker cannot run outside isolation");
const request = JSON.parse(await readFile("/job/request.json", "utf8"));
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
