import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthFetcher } from "./auth";
import { downloadImportFile, mediaDownloadURL, remainingImportBudget } from "./import-media";
import { storyCaptionMarkup } from "./story-caption-import";
import { compositionSize } from "./composition-size";

interface Source {
  id: string;
  name: string;
  source_url: string;
  proxy_url?: string;
  color_transfer?: string;
  video_codec?: string;
  audio_codec?: string;
  candidates?: unknown;
  duration: number;
  has_audio: boolean;
  processed_audio_url?: string;
}
interface Interval {
  source_id: string;
  in: number;
  out: number;
}
interface Entry {
  words?: unknown;
  block_id: string;
  output_in: number;
  output_out: number;
  video: Interval;
  audio?: Interval;
  crop?: string;
  transition?: string;
}
interface StoryVersion {
  preview_url?: unknown;
  export_url?: unknown;
  number: number;
  accepted: boolean;
  timeline: Entry[];
  render_options?: Record<string, unknown>;
  output?: Record<string, unknown>;
}
export interface StoryImport {
  assets: Source[];
  version: StoryVersion;
  options: Record<string, unknown>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
const interval = (value: unknown): value is Interval =>
  record(value) &&
  typeof value.source_id === "string" &&
  finite(value.in) &&
  finite(value.out) &&
  value.in >= 0 &&
  value.out > value.in;

/** Validate the owned Story response before any of its sources are downloaded. */
export function parseStoryImport(
  value: unknown,
  storyId: string,
  versionNumber: number,
): StoryImport {
  if (
    !record(value) ||
    value.id !== storyId ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.versions)
  )
    throw new Error("Story sources are unavailable.");
  const version = value.versions.find((item) => record(item) && item.number === versionNumber);
  if (
    !record(version) ||
    version.accepted !== true ||
    !Array.isArray(version.timeline) ||
    !version.timeline.length ||
    version.timeline.length > 1000
  ) {
    throw new Error("The story has changed. Refresh your library before opening it in Studio.");
  }
  const assets: Source[] = [];
  for (const asset of value.assets) {
    if (
      !record(asset) ||
      typeof asset.id !== "string" ||
      typeof asset.source_url !== "string" ||
      !finite(asset.duration) ||
      asset.duration <= 0
    )
      throw new Error("An original source is unavailable.");
    assets.push({
      id: asset.id,
      name: typeof asset.name === "string" ? asset.name : "Source",
      source_url: asset.source_url,
      ...(typeof asset.proxy_url === "string" ? { proxy_url: asset.proxy_url } : {}),
      ...(typeof asset.color_transfer === "string" ? { color_transfer: asset.color_transfer } : {}),
      ...(typeof asset.video_codec === "string" ? { video_codec: asset.video_codec } : {}),
      ...(typeof asset.audio_codec === "string" ? { audio_codec: asset.audio_codec } : {}),
      candidates: asset.candidates,
      duration: asset.duration,
      has_audio: asset.has_audio === true,
      ...(typeof asset.processed_audio_url === "string"
        ? { processed_audio_url: asset.processed_audio_url }
        : {}),
    });
  }
  const timeline: Entry[] = [];
  for (const item of version.timeline) {
    if (
      !record(item) ||
      typeof item.block_id !== "string" ||
      !finite(item.output_in) ||
      !finite(item.output_out) ||
      item.output_in < 0 ||
      item.output_out <= item.output_in ||
      !interval(item.video) ||
      (item.audio != null && !interval(item.audio))
    )
      throw new Error("Story timing is invalid.");
    for (const part of [item.video, item.audio].filter(interval)) {
      const source = assets.find((asset) => asset.id === part.source_id);
      if (!source || part.out > source.duration + 0.1)
        throw new Error("A story cut exceeds its original source.");
    }
    timeline.push({
      ...item,
      block_id: item.block_id,
      output_in: item.output_in,
      output_out: item.output_out,
      video: item.video,
      ...(interval(item.audio) ? { audio: item.audio } : {}),
    });
  }
  const options = record(version.render_options)
    ? version.render_options
    : record(value.options)
      ? value.options
      : {};
  return {
    assets,
    version: { ...version, number: versionNumber, accepted: true, timeline },
    options,
  };
}

export function storySourceComposition(
  title: string,
  story: StoryImport,
  paths: Map<string, string>,
  audioPaths: Map<string, string>,
  captions: { html: string; css: string; animation?: string },
  elementsOverride?: string,
): string {
  const { width, height } = compositionSize(story.options.aspect_ratio);
  const duration = Math.max(...story.version.timeline.map((entry) => entry.output_out));
  const elements =
    elementsOverride ??
    story.version.timeline
      .map((entry, index) => {
        const source = story.assets.find((asset) => asset.id === entry.video.source_id)!;
        const length = entry.output_out - entry.output_in;
        const sameAudio =
          entry.audio?.source_id === entry.video.source_id &&
          Math.abs(entry.audio.in - entry.video.in) < 0.001 &&
          !audioPaths.has(source.id);
        const video = `<video id="scene-${index + 1}" class="clip source-video" data-label="${escape(source.name)}" data-start="${entry.output_in}" data-duration="${length}" data-track-index="0" data-media-start="${entry.video.in}" data-source-duration="${source.duration}" data-has-audio="${Boolean(sameAudio && source.has_audio)}" src="${paths.get(source.id)}" style="object-fit:${entry.crop === "fit" ? "contain" : "cover"}" playsinline${sameAudio && source.has_audio ? "" : " muted"} preload="metadata"></video>`;
        if (!entry.audio || sameAudio) return video;
        const audio = story.assets.find((asset) => asset.id === entry.audio?.source_id)!;
        return (
          video +
          `<audio id="audio-${index + 1}" class="clip" data-label="${escape(audio.name)}" data-start="${entry.output_in}" data-duration="${length}" data-track-index="1" data-media-start="${entry.audio.in}" data-source-duration="${audio.duration}" src="${audioPaths.get(audio.id) ?? paths.get(audio.id)}" preload="metadata"></audio>`
        );
      })
      .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><script src="vendor/gsap.min.js"></script><style>body{margin:0;background:#101313}#main{position:relative;width:${width}px;height:${height}px;overflow:hidden}.source-video{position:absolute;inset:0;width:100%;height:100%}${captions.css}</style></head><body><div id="main" data-composition-id="main" data-width="${width}" data-height="${height}" data-duration="${duration}">${elements}${captions.html}</div><script>window.__timelines["main"]=gsap.timeline({paused:true}).to({}, {duration:${duration}});${captions.animation ?? ""}</script></body></html>`;
}

function hasAttachedSpeech(entry: Entry): boolean {
  return (
    entry.audio?.source_id === entry.video.source_id &&
    Math.abs(entry.audio.in - entry.video.in) < 0.001
  );
}

/** A source composition is the edit boundary: trims/moves shift picture, camera speech and captions together. */
export function linkedStoryComposition(
  story: StoryImport,
  title: string,
  paths: Map<string, string>,
  audioPaths: Map<string, string>,
  music = "",
) {
  const dimensions = compositionSize(story.options.aspect_ratio);
  const scenes = new Map<string, string>();
  const hosts: string[] = [];
  for (const [index, entry] of story.version.timeline.entries()) {
    const source = story.assets.find((asset) => asset.id === entry.video.source_id)!;
    const attached = hasAttachedSpeech(entry);
    const words =
      attached && Array.isArray(entry.words)
        ? entry.words.filter(record).map((word) => ({
            ...word,
            start: finite(word.start) ? word.start - entry.output_in + entry.video.in : -1,
            end: finite(word.end) ? word.end - entry.output_in + entry.video.in : -1,
          }))
        : [];
    const fullEntry: Entry = {
      ...entry,
      output_in: 0,
      output_out: source.duration,
      video: { source_id: source.id, in: 0, out: source.duration },
      audio: attached ? { source_id: source.id, in: 0, out: source.duration } : undefined,
      words,
    };
    const sceneStory = { ...story, version: { ...story.version, timeline: [fullEntry] } };
    const captions = storyCaptionMarkup(
      { ...sceneStory.version, render_options: story.options },
      dimensions,
      story.assets,
    );
    const id = `source-scene-${index + 1}`;
    const html = storySourceComposition(source.name, sceneStory, paths, audioPaths, captions)
      .replaceAll('id="scene-1"', `id="${id}-video"`)
      .replaceAll('id="audio-1"', `id="${id}-audio"`)
      .replaceAll('id="main"', `id="${id}"`)
      .replaceAll('data-composition-id="main"', `data-composition-id="${id}"`)
      .replaceAll("#main{", `#${id}{`)
      .replaceAll('["main"]', `["${id}"]`)
      .replaceAll("story-caption-", `${id}-caption-`);
    scenes.set(`${id}.html`, html);
    hosts.push(
      `<div id="scene-${index + 1}" class="clip source-video" data-label="${escape(source.name)}" data-source-window data-composition-id="${id}" data-composition-src="${id}.html" data-start="${entry.output_in}" data-duration="${entry.output_out - entry.output_in}" data-track-index="0" data-playback-start="${entry.video.in}" data-source-duration="${source.duration}" data-width="${dimensions.width}" data-height="${dimensions.height}"></div>`,
    );
    if (entry.audio && !attached) {
      const audio = story.assets.find((asset) => asset.id === entry.audio?.source_id)!;
      hosts.push(
        `<audio id="narration-${index + 1}" class="clip" data-label="${escape(audio.name)}" data-start="${entry.output_in}" data-duration="${entry.output_out - entry.output_in}" data-track-index="1" data-media-start="${entry.audio.in}" data-source-duration="${audio.duration}" src="${audioPaths.get(audio.id) ?? paths.get(audio.id)}" preload="metadata"></audio>`,
      );
    }
  }
  const captions = storyCaptionMarkup(
    {
      ...story.version,
      timeline: story.version.timeline.filter((entry) => !hasAttachedSpeech(entry)),
      render_options: story.options,
    },
    dimensions,
    story.assets,
  );
  return {
    html: storySourceComposition(
      title,
      story,
      paths,
      audioPaths,
      { ...captions, html: captions.html + music },
      hosts.join("\n"),
    ),
    scenes,
  };
}

export async function importStorySources(
  story: StoryImport,
  dir: string,
  title: string,
  options: {
    fetcher: AuthFetcher;
    apiOrigin: string;
    mediaOrigin: string;
    mediaFetchOrigin?: string;
    bearer: string;
  },
) {
  const used = new Set(
    story.version.timeline.flatMap((entry) => [
      entry.video.source_id,
      ...(entry.audio ? [entry.audio.source_id] : []),
    ]),
  );
  const paths = new Map<string, string>();
  const audioPaths = new Map<string, string>();
  let remaining = await remainingImportBudget(dir);
  await mkdir(join(dir, "assets"), { recursive: true });
  // Sequential downloads bound memory and total project size, and preserve a clean retry.
  for (const [index, source] of story.assets.filter((asset) => used.has(asset.id)).entries()) {
    const path = `assets/source-${index + 1}.mp4`;
    const browserProxy = storyBrowserProxy(source);
    remaining -= await downloadImportFile(
      options.fetcher,
      mediaDownloadURL(
        browserProxy ?? source.source_url,
        options.mediaOrigin,
        options.mediaFetchOrigin,
      ),
      join(dir, path),
      Math.min(2 * 1024 ** 3, remaining),
    );
    paths.set(source.id, path);
    if (browserProxy && browserProxy !== source.source_url) {
      remaining -= await downloadImportFile(
        options.fetcher,
        mediaDownloadURL(source.source_url, options.mediaOrigin, options.mediaFetchOrigin),
        join(dir, `assets/original-source-${index + 1}.mov`),
        Math.min(2 * 1024 ** 3, remaining),
      );
    }
    if (source.processed_audio_url) {
      const audioPath = `assets/audio-${index + 1}.wav`;
      remaining -= await downloadImportFile(
        options.fetcher,
        mediaDownloadURL(source.processed_audio_url, options.mediaOrigin, options.mediaFetchOrigin),
        join(dir, audioPath),
        Math.min(512 * 1024 ** 2, remaining),
      );
      audioPaths.set(source.id, audioPath);
    }
  }
  const dimensions = compositionSize(story.options.aspect_ratio);
  const captions = storyCaptionMarkup(
    { ...story.version, render_options: story.options },
    dimensions,
    story.assets,
  );
  if (captions.font) {
    const fontURL = new URL("/api/user/brand/font-file", options.apiOrigin);
    fontURL.searchParams.set("id", captions.font.id);
    fontURL.searchParams.set("weight", String(captions.font.weight));
    remaining -= await downloadImportFile(
      options.fetcher,
      fontURL,
      join(dir, captions.font.path),
      Math.min(20 * 1024 ** 2, remaining),
      options.bearer,
    );
  }
  const music = await importStoryMusic(story, dir, { ...options, maxBytes: remaining });
  const notes = [
    "Original source clips can be shortened and extended within their source duration.",
    "Camera speech and captions stay attached to each clip when you trim or move it. Double-click a clip to edit its contents.",
    "Narration and music stay on independent tracks. Review their synchronization after edits. Extended footage may need additional captions.",
    "The untouched finished video is available in original-export.html.",
    "Source edits use a static crop; review framing after changing the canvas.",
    "Studio exports SDR. For HDR output, use the HDR export in Story Builder. Original source files are retained in Assets.",
    "The complete imported project, including retained originals and exports, is limited to 500 MiB.",
  ];
  if (music) notes.push("Music is on a separate track. Review its mix and fade after edits.");
  if (story.assets.some((source) => storyBrowserProxy(source)))
    notes.push(
      "Footage with HDR or camera codecs that browsers cannot play uses SDR preview copies up to 1280px in Studio. Use Story Builder to export the original quality.",
    );
  if (story.version.timeline.some((entry) => entry.transition && entry.transition !== "cut"))
    notes.push(
      "Transitions are reconstructed as cuts. The original export retains the generated transitions.",
    );
  await writeFile(join(dir, "import-notes.txt"), notes.join("\n"));
  const linked = linkedStoryComposition(story, title, paths, audioPaths, music);
  for (const [path, html] of linked.scenes) await writeFile(join(dir, path), html);
  return linked.html;
}

/** Preserve browser-compatible originals; use the verified proxy for camera codecs and HDR. */
export function storyBrowserProxy(
  source: Pick<
    Source,
    | "name"
    | "source_url"
    | "proxy_url"
    | "color_transfer"
    | "video_codec"
    | "audio_codec"
    | "has_audio"
  >,
): string | undefined {
  if (!source.proxy_url) return undefined;
  const hdr = ["smpte2084", "arib-std-b67"].includes(source.color_transfer ?? "");
  const unsupportedVideo = !!source.video_codec && source.video_codec !== "h264";
  const unsupportedAudio = source.has_audio && !!source.audio_codec && source.audio_codec !== "aac";
  const missingCodecs = !source.video_codec || (source.has_audio && !source.audio_codec);
  const legacyMov =
    missingCodecs && (/\.mov$/i.test(source.name) || /\.mov(?:\?|$)/i.test(source.source_url));
  return hdr || unsupportedVideo || unsupportedAudio || legacyMov ? source.proxy_url : undefined;
}

async function importStoryMusic(
  story: StoryImport,
  dir: string,
  options: { fetcher: AuthFetcher; apiOrigin: string; bearer: string; maxBytes: number },
): Promise<string> {
  const selection = story.options.music;
  if (!record(selection) || typeof selection.track_id !== "string") return "";
  const response = await options.fetcher(
    new URL(`/api/music/${encodeURIComponent(selection.track_id)}`, options.apiOrigin),
    {
      headers: { Authorization: options.bearer },
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw new Error("The story music is unavailable. Try importing again.");
  const track: unknown = await response.json();
  if (
    !record(track) ||
    track.id !== selection.track_id ||
    typeof track.preview_url !== "string" ||
    !finite(track.duration_seconds) ||
    track.duration_seconds <= 0
  )
    throw new Error("The story music metadata is invalid.");
  const url = new URL(track.preview_url);
  if (
    url.protocol !== "https:" ||
    !["incompetech.com", "www.incompetech.com"].includes(url.host) ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/music/royalty-free/mp3-royaltyfree/") ||
    !url.pathname.endsWith(".mp3")
  )
    throw new Error("The story music address is unsupported.");
  await downloadImportFile(
    options.fetcher,
    url,
    join(dir, "assets/music.mp3"),
    Math.min(64 * 1024 ** 2, options.maxBytes),
  );
  if (typeof track.attribution === "string")
    await writeFile(join(dir, "music-attribution.txt"), track.attribution);
  const duration = Math.max(...story.version.timeline.map((entry) => entry.output_out));
  const volume = finite(selection.volume) ? Math.max(0, Math.min(1, selection.volume)) : 0.15;
  let html = "";
  for (let start = 0, index = 0; start < duration; start += track.duration_seconds, index++) {
    html += `<audio id="music-${index}" class="clip" data-label="Music" data-start="${start}" data-duration="${Math.min(duration - start, track.duration_seconds)}" data-track-index="3" data-media-start="0" data-source-duration="${track.duration_seconds}" data-volume="${volume}" src="assets/music.mp3" preload="metadata"></audio>`;
  }
  if (typeof track.attribution !== "string" || !track.attribution.trim())
    throw new Error("The music attribution is missing.");
  return (
    html +
    musicCreditMarkup(track.attribution, duration, compositionSize(story.options.aspect_ratio))
  );
}

/** Required catalogue credit stays visible in the editable composition and its export. */
export function musicCreditMarkup(
  attribution: string,
  duration: number,
  dimensions: { width: number; height: number },
): string {
  const displayDuration = Math.min(5, duration);
  const size = Math.max(14, Math.round(Math.min(dimensions.width, dimensions.height) * 0.022));
  return `<div id="music-attribution" class="clip" data-label="Music credit" data-start="${duration - displayDuration}" data-duration="${displayDuration}" data-track-index="4" style="position:absolute;left:5%;right:5%;bottom:2%;z-index:50;padding:12px;font:${size}px/1.3 sans-serif;color:#fff;background:rgba(0,0,0,.75);text-align:center;white-space:normal">${escape(attribution)}</div>`;
}
