import { createHash } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HTTPException } from "hono/http-exception";
import { bundledGsap } from "./assets";
import { isUUID, type ProjectStore } from "./store";
import type { AuthFetcher } from "./auth";
import { sandboxProbeAudio } from "./sandbox";

const MAX_BYTES = 512 * 1024 * 1024;
export function stableProjectId(source: string): string {
  const hash = createHash("sha256").update(source).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

export function videoComposition(
  title: string,
  duration: number,
  aspect: string,
  hasVideo = true,
  hasAudio = false,
): string {
  const [width, height] =
    aspect === "9:16" ? [1080, 1920] : aspect === "1:1" ? [1080, 1080] : [1920, 1080];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><script src="vendor/gsap.min.js"></script>
<style>body{margin:0;background:#101313}#main{position:relative;width:${width}px;height:${height}px;overflow:hidden}.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}</style></head>
<body><div id="main" data-composition-id="main" data-width="${width}" data-height="${height}" data-duration="${duration}">${hasVideo ? `<video id="generated-clip" class="clip" data-start="0" data-duration="${duration}" data-track-index="0" data-media-start="0" data-has-audio="${hasAudio}" src="assets/clip.mp4" playsinline${hasAudio ? "" : " muted"} preload="auto"></video>` : ""}</div>
<script>window.__timelines["main"]=gsap.timeline({paused:true}).to({}, {duration:${duration}});</script></body></html>`;
}

async function writeComposition(dir: string, html: string) {
  const gsap = bundledGsap("gsap.min.js");
  if (!gsap) throw new Error("Bundled animation library unavailable");
  await mkdir(join(dir, "vendor"), { recursive: true });
  await writeFile(join(dir, "vendor", "gsap.min.js"), gsap);
  await writeFile(join(dir, "index.html"), html);
}

export function openEmptyWorkspace(store: ProjectStore, userId: string) {
  return store.ensure(userId, stableProjectId("empty-workspace"), "Untitled project", (project) =>
    writeComposition(project.dir, videoComposition(project.title, 6, "16:9", false)),
  );
}

export function createClipImporter(options: {
  store: ProjectStore;
  apiOrigin: string;
  mediaOrigin: string;
  mediaFetchOrigin?: string;
  fetcher?: AuthFetcher;
  probeAudio?: typeof sandboxProbeAudio;
}) {
  const fetcher = options.fetcher ?? fetch;
  const mediaOrigin = new URL(options.mediaOrigin).origin;
  const mediaFetchOrigin = options.mediaFetchOrigin ? new URL(options.mediaFetchOrigin) : null;
  if (
    mediaFetchOrigin &&
    (!["http:", "https:"].includes(mediaFetchOrigin.protocol) ||
      mediaFetchOrigin.username ||
      mediaFetchOrigin.password ||
      mediaFetchOrigin.pathname !== "/" ||
      mediaFetchOrigin.search ||
      mediaFetchOrigin.hash)
  ) {
    throw new Error("Studio internal media address must be an HTTP(S) origin");
  }
  return async (userId: string, bearer: string, clipId: string) => {
    if (!isUUID(clipId)) throw new HTTPException(400, { message: "Invalid clip identifier" });
    // The authoritative API checks ownership. Never accept a media URL from the browser.
    const response = await fetcher(new URL(`/api/clips/${clipId}`, options.apiOrigin), {
      headers: { Authorization: bearer },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new HTTPException(response.status === 404 ? 404 : 502, {
        message: "This clip is unavailable. Refresh your library and try again.",
      });
    const clip: unknown = await response.json();
    if (
      !clip ||
      typeof clip !== "object" ||
      !("id" in clip) ||
      clip.id !== clipId ||
      !("user_id" in clip) ||
      clip.user_id !== userId ||
      !("title" in clip) ||
      typeof clip.title !== "string" ||
      !("file_url" in clip) ||
      typeof clip.file_url !== "string" ||
      !clip.file_url ||
      !("duration" in clip) ||
      typeof clip.duration !== "number" ||
      !Number.isFinite(clip.duration) ||
      clip.duration <= 0 ||
      clip.duration > 3600
    ) {
      throw new HTTPException(422, { message: "The clip is not ready to edit yet." });
    }
    const source = new URL(clip.file_url, mediaOrigin);
    if (
      source.origin !== mediaOrigin ||
      source.username ||
      source.password ||
      !source.pathname.startsWith("/media/")
    )
      throw new HTTPException(422, { message: "The clip storage address is not supported." });
    // Validate the public signed URL before changing only its transport destination.
    // Assign path/search separately so neither can change the trusted internal host.
    const downloadSource = mediaFetchOrigin ? new URL(mediaFetchOrigin.origin) : source;
    if (mediaFetchOrigin) {
      downloadSource.pathname = source.pathname;
      downloadSource.search = source.search;
    }
    const title = clip.title || "Generated clip";
    const aspect =
      "aspect_ratio" in clip && typeof clip.aspect_ratio === "string" ? clip.aspect_ratio : "16:9";
    const duration = clip.duration;
    return options.store.ensure(
      userId,
      stableProjectId(`clip:${clipId}`),
      title,
      async (project) => {
        const media = await fetcher(downloadSource, {
          redirect: "error",
          signal: AbortSignal.timeout(120000),
        });
        if (!media.ok || !media.body)
          throw new HTTPException(502, {
            message: "Could not retrieve the clip. Please try again.",
          });
        if (Number(media.headers.get("Content-Length")) > MAX_BYTES) {
          await media.body.cancel();
          throw new HTTPException(413, {
            message: "This clip exceeds the 512 MB Studio import limit.",
          });
        }
        await mkdir(join(project.dir, "assets"));
        const output = await open(join(project.dir, "assets", "clip.mp4"), "wx");
        const reader = media.body.getReader();
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES)
              throw new HTTPException(413, {
                message: "This clip exceeds the 512 MB Studio import limit.",
              });
            await output.writeFile(part.value);
          }
          if (!bytes) throw new Error("Empty clip file");
        } finally {
          await reader.cancel();
          await output.close();
        }
        const hasAudio = await (options.probeAudio ?? sandboxProbeAudio)(project);
        await writeComposition(
          project.dir,
          videoComposition(title, duration, aspect, true, hasAudio),
        );
      },
    );
  };
}
