// Invoked by scripts/test-media-s3.mjs inside the Studio container. All projects
// and renders are synthetic and removed in finally; the normal server is unused.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClipImporter } from "./clip-import";
import { ProjectStore } from "./store";
import { sandboxThumbnail, startSandboxRender } from "./sandbox";

const input = JSON.parse(await Bun.stdin.text()) as { sourceURL: string; owner: string; sha256: string };
const source = new URL(input.sourceURL);
if (source.protocol !== "http:" || source.hostname !== "s3.localhost" || source.username || source.password)
  throw new Error("Verification requires the local Docker S3 alias");
const root = await mkdtemp(join(tmpdir(), "s3-media-verification-"));
try {
  const clipID = randomUUID();
  const importer = createClipImporter({
    store: new ProjectStore(root), apiOrigin: "http://synthetic.invalid", mediaOrigin: "http://localhost:3000",
    mediaFetchOrigin: "http://nginx", mediaS3Origin: source.origin,
    mediaS3InternalOrigin: `http://seaweedfs:${source.port}`,
    fetcher: async (url, init) => {
      const address = new URL(url instanceof Request ? url.url : url);
      if (address.hostname === "synthetic.invalid")
        return Response.json({ id: clipID, user_id: input.owner, title: "Local S3 verification", duration: 1, aspect_ratio: "16:9", file_url: input.sourceURL });
      if (new Headers(init?.headers).has("Authorization")) throw new Error("API credentials forwarded to S3");
      return fetch(url, init);
    },
  });
  const project = await importer(input.owner, "Bearer synthetic", clipID);
  const video = await readFile(join(project.dir, "assets/clip.mp4"));
  if (createHash("sha256").update(video).digest("hex") !== input.sha256)
    throw new Error("Studio S3 import changed the video bytes");
  const thumbnail = await sandboxThumbnail({ project, compPath: "index.html", seekTime: 0.5,
    width: 1920, height: 1080, outputWidth: 320, outputHeight: 180,
    previewUrl: `http://preview.invalid:5191/api/projects/${project.id}/preview/index.html`, signal: new AbortController().signal });
  if (thumbnail.length < 1000) throw new Error("Studio did not render a thumbnail");
  const render = startSandboxRender({ project, outputPath: join(project.dir, "renders/s3.mp4"), format: "mp4",
    fps: { num: 12, den: 1 }, quality: "draft", jobId: randomUUID() });
  const deadline = Date.now() + 60000;
  while (render.status === "rendering" && Date.now() < deadline) await Bun.sleep(100);
  if (render.status !== "complete") { render.cancel?.(); throw new Error(render.error || "Studio render did not complete"); }
  if ((await readFile(render.outputPath)).subarray(4, 8).toString() !== "ftyp")
    throw new Error("Studio export was not an MP4");
  console.log("Studio private S3 import, thumbnail and MP4 render passed");
} finally { await rm(root, { recursive: true, force: true }); }
