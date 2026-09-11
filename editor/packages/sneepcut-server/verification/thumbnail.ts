import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStudioServer } from "../../cli/src/server/studioServer";
import { captureThumbnail } from "../src/thumbnail";
import { initializeProject } from "../src/starter";

const dir = await mkdtemp(join(tmpdir(), "sneepcut-thumbnail-check-"));
const project = { id: "synthetic", dir, title: "Thumbnail verification" };
const server = createStudioServer({ projectDir: dir, projectName: project.id });
console.log("Thumbnail fixture initialized");
try {
  await initializeProject(project);
  const bytes = await captureThumbnail(server.app, {
    project,
    compPath: "index.html",
    seekTime: 1,
    width: 1920,
    height: 1080,
    outputWidth: 240,
    outputHeight: 135,
    format: "png",
    previewUrl: "http://localhost/api/projects/synthetic/preview",
    signal: AbortSignal.timeout(45000),
  });
  if (!bytes || bytes.readUInt32BE(16) !== 240 || bytes.readUInt32BE(20) !== 135) {
    throw new Error(
      `Unexpected thumbnail dimensions: ${bytes?.readUInt32BE(16)}x${bytes?.readUInt32BE(20)}`,
    );
  }
  console.log(`Verified PNG thumbnail: 240x135, ${bytes.length} bytes`);
} finally {
  server.watcher.close();
  await rm(dir, { recursive: true, force: true });
}
