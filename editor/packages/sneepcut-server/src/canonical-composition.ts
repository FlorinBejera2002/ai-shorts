import { storyCaptionMarkup } from "./story-caption-import";

export interface CanonicalAsset {
  id: string;
  name: string;
  kind: "video" | "audio" | "image" | "font";
  url: string;
  preview_url?: string;
  duration?: number;
  width?: number;
  height?: number;
  has_audio?: boolean;
}
export interface CanonicalCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CanonicalScene {
  id: string;
  asset_id: string;
  start: number;
  duration: number;
  source_in: number;
  fit?: "contain" | "cover";
  crop?: CanonicalCrop;
  crop_keyframes?: (CanonicalCrop & { time: number })[];
  fade_in?: number;
  fade_out?: number;
  role?: "bridge";
  parent_scene_id?: string;
}
export interface CanonicalAudio {
  id: string;
  asset_id: string;
  start: number;
  duration: number;
  source_in: number;
  volume?: number;
  envelope?: { time: number; value: number }[];
  scene_id?: string;
}
export interface CanonicalOverlay {
  id: string;
  asset_id?: string;
  text?: string;
  start: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  font_size?: number;
  font_asset_id?: string;
  color?: string;
  background?: string;
  align?: "left" | "center" | "right";
}
export interface CanonicalCompositionPlan {
  schema_version: 1;
  title: string;
  width: number;
  height: number;
  duration: number;
  dynamic_range: "sdr" | "hdr";
  assets: CanonicalAsset[];
  scenes: CanonicalScene[];
  audio: CanonicalAudio[];
  captions?: {
    groups: { text: string; start: number; end: number }[][];
    style: Record<string, unknown>;
    font_asset_id?: string;
    font_size_px?: number;
  };
  overlays?: CanonicalOverlay[];
}
export type CanonicalAssetPath = string | { path: string; previewPath?: string };
export interface CanonicalComposition {
  html: string;
  files: Map<string, string>;
  renderOptions: { hdrMode: "force-hdr" | "force-sdr" };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
function invalid(detail: string): never {
  throw new Error(`Invalid canonical composition: ${detail}`);
}
function numeric(value: unknown): number {
  if (!finite(value)) invalid("number");
  return value;
}
function optionalNumber(value: unknown): number | undefined {
  return value === undefined ? undefined : numeric(value);
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalid("text");
  return value;
}
function assetKind(value: unknown): CanonicalAsset["kind"] {
  if (value === "video" || value === "audio" || value === "image" || value === "font") return value;
  return invalid("asset kind");
}
function alignment(value: unknown): CanonicalOverlay["align"] {
  if (value === undefined || value === "left" || value === "center" || value === "right")
    return value;
  return invalid("alignment");
}
function captionStyle(value: Record<string, unknown>): Record<string, unknown> {
  const presets = [
    "classic",
    "minimal",
    "bold-outline",
    "contrast-box",
    "headline",
    "word-by-word",
    "karaoke",
    "active-color",
    "active-background",
    "phrase-pop",
    "subtle-fade",
    "stacked",
  ];
  if (value.preset !== undefined && !presets.includes(String(value.preset)))
    invalid("caption preset");
  for (const key of ["text_color", "outline_color", "background_color", "highlight_color"])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || !/^#[\da-f]{6}$/i.test(value[key]))
    )
      invalid("caption color");
  for (const key of [
    "size",
    "weight",
    "outline",
    "shadow",
    "background_opacity",
    "max_width",
    "max_lines",
    "line_spacing",
    "letter_spacing",
    "word_spacing",
  ])
    if (value[key] !== undefined && !finite(value[key])) invalid("caption typography");
  alignment(value.align);
  if (
    value.font_id !== undefined &&
    (typeof value.font_id !== "string" ||
      value.font_id.length > 150 ||
      !/^[\w: .-]+$/.test(value.font_id))
  )
    invalid("caption font identity");
  if (
    value.position !== undefined &&
    (!record(value.position) ||
      !finite(value.position.x) ||
      !finite(value.position.y) ||
      value.position.x < 0 ||
      value.position.x > 1 ||
      value.position.y < 0 ||
      value.position.y > 1 ||
      (value.position.anchor !== undefined && value.position.anchor !== "center"))
  )
    invalid("caption position");
  return value;
}
function window(value: Record<string, unknown>, duration: number) {
  if (
    !finite(value.start) ||
    value.start < 0 ||
    !positive(value.duration) ||
    value.start + value.duration > duration + 0.002
  )
    invalid("clip timing");
}
function crop(value: unknown): value is CanonicalCrop {
  return (
    record(value) &&
    finite(value.x) &&
    value.x >= 0 &&
    finite(value.y) &&
    value.y >= 0 &&
    positive(value.width) &&
    positive(value.height)
  );
}
function mediaWindow(
  value: Record<string, unknown>,
  asset: CanonicalAsset | undefined,
  duration: number,
) {
  window(value, duration);
  if (
    !asset ||
    !positive(asset.duration) ||
    !finite(value.source_in) ||
    value.source_in < 0 ||
    !positive(value.duration) ||
    value.source_in + value.duration > asset.duration + 0.002
  )
    invalid("source window");
}

/** Validate the complete render plan before downloading or publishing any project. */
export function parseCanonicalComposition(value: unknown): CanonicalCompositionPlan {
  if (
    !record(value) ||
    value.schema_version !== 1 ||
    typeof value.title !== "string" ||
    value.title.length > 1000 ||
    !positive(value.width) ||
    !positive(value.height) ||
    value.width > 8192 ||
    value.height > 8192 ||
    !positive(value.duration) ||
    value.duration > 3600 ||
    !["sdr", "hdr"].includes(String(value.dynamic_range)) ||
    !Array.isArray(value.assets) ||
    !Array.isArray(value.scenes) ||
    !value.scenes.length ||
    value.scenes.length > 1000 ||
    !Array.isArray(value.audio)
  )
    invalid("header");
  if (
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    value.width % 2 ||
    value.height % 2 ||
    value.assets.length > 3000 ||
    value.audio.length > 3000
  )
    invalid("dimensions or asset count");
  const dynamicRange = value.dynamic_range === "hdr" ? "hdr" : "sdr";
  const assets: CanonicalAsset[] = [];
  const ids = new Set<string>();
  const claim = (candidate: unknown) => {
    if (!id(candidate) || ids.has(candidate)) invalid("duplicate or unsafe identity");
    ids.add(candidate);
    return candidate;
  };
  for (const item of value.assets) {
    if (
      !record(item) ||
      typeof item.name !== "string" ||
      typeof item.url !== "string" ||
      !["video", "audio", "image", "font"].includes(String(item.kind))
    )
      invalid("asset");
    claim(item.id);
    if (item.preview_url !== undefined && typeof item.preview_url !== "string")
      invalid("preview asset");
    if ((item.kind === "video" || item.kind === "audio") && !positive(item.duration))
      invalid("media duration");
    if (
      (item.width !== undefined && !positive(item.width)) ||
      (item.height !== undefined && !positive(item.height))
    )
      invalid("source dimensions");
    if (
      !item.url ||
      item.url.length > 8192 ||
      (typeof item.preview_url === "string" && item.preview_url.length > 8192) ||
      item.name.length > 1000
    )
      invalid("asset URL or name");
    assets.push({
      id: String(item.id),
      name: item.name,
      kind: assetKind(item.kind),
      url: item.url,
      preview_url: optionalString(item.preview_url),
      duration: optionalNumber(item.duration),
      width: optionalNumber(item.width),
      height: optionalNumber(item.height),
      has_audio: item.has_audio === true,
    });
  }
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const scenes: CanonicalScene[] = [];
  for (const item of value.scenes) {
    if (!record(item) || typeof item.asset_id !== "string") invalid("scene");
    claim(item.id);
    const asset = assetById.get(item.asset_id);
    mediaWindow(item, asset, value.duration);
    if (asset?.kind !== "video") invalid("scene asset");
    if (item.fit !== undefined && item.fit !== "contain" && item.fit !== "cover")
      invalid("framing");
    if (item.role !== undefined && item.role !== "bridge") invalid("scene role");
    if (
      item.role === "bridge"
        ? typeof item.parent_scene_id !== "string"
        : item.parent_scene_id !== undefined
    )
      invalid("bridge parent");
    if (
      item.role === "bridge" &&
      (item.crop !== undefined ||
        item.crop_keyframes !== undefined ||
        item.fade_in ||
        item.fade_out)
    )
      invalid("bridge picture must already match its parent canvas");
    const checkCrop = (candidate: unknown): CanonicalCrop => {
      if (
        !crop(candidate) ||
        !positive(asset.width) ||
        !positive(asset.height) ||
        candidate.x + candidate.width > asset.width + 0.01 ||
        candidate.y + candidate.height > asset.height + 0.01
      )
        invalid("crop geometry");
      return { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
    };
    if (item.crop !== undefined) checkCrop(item.crop);
    if (item.crop_keyframes !== undefined) {
      if (!Array.isArray(item.crop_keyframes) || item.crop_keyframes.length > 10000)
        invalid("crop keyframes");
      let previous = -1;
      for (const frame of item.crop_keyframes) {
        checkCrop(frame);
        if (
          !record(frame) ||
          !finite(frame.time) ||
          frame.time < 0 ||
          frame.time <= previous ||
          !positive(item.duration) ||
          frame.time > item.duration
        )
          invalid("crop keyframe timing");
        previous = frame.time;
      }
    }
    for (const field of ["fade_in", "fade_out"])
      if (
        item[field] !== undefined &&
        (!finite(item[field]) ||
          item[field] < 0 ||
          !positive(item.duration) ||
          item[field] > item.duration)
      )
        invalid("fade");
    scenes.push({
      id: String(item.id),
      asset_id: item.asset_id,
      start: numeric(item.start),
      duration: numeric(item.duration),
      source_in: numeric(item.source_in),
      fit: item.fit === "cover" ? "cover" : "contain",
      crop: item.crop === undefined ? undefined : checkCrop(item.crop),
      crop_keyframes: Array.isArray(item.crop_keyframes)
        ? item.crop_keyframes.map((frame) => ({ ...checkCrop(frame), time: numeric(frame.time) }))
        : undefined,
      fade_in: optionalNumber(item.fade_in),
      fade_out: optionalNumber(item.fade_out),
      role: item.role === "bridge" ? "bridge" : undefined,
      parent_scene_id: typeof item.parent_scene_id === "string" ? item.parent_scene_id : undefined,
    });
  }
  for (const scene of scenes.filter((entry) => entry.role === "bridge")) {
    const parent = scenes.find((entry) => entry.id === scene.parent_scene_id && !entry.role);
    if (
      !parent ||
      scene.start < parent.start - 0.002 ||
      scene.start + scene.duration > parent.start + parent.duration + 0.002
    )
      invalid("bridge interval must belong to its parent scene");
  }
  const audio: CanonicalAudio[] = [];
  for (const item of value.audio) {
    if (!record(item) || typeof item.asset_id !== "string") invalid("audio");
    claim(item.id);
    const asset = assetById.get(item.asset_id);
    mediaWindow(item, asset, value.duration);
    if (asset?.kind !== "audio" && asset?.kind !== "video") invalid("audio source");
    if (
      item.volume !== undefined &&
      (!finite(item.volume) || item.volume < 0 || item.volume > 3.98)
    )
      invalid("audio gain");
    if (
      item.scene_id !== undefined &&
      !scenes.some(
        (scene) =>
          scene.id === item.scene_id &&
          !scene.role &&
          Math.abs(scene.start - Number(item.start)) < 0.002 &&
          Math.abs(scene.duration - Number(item.duration)) < 0.002,
      )
    )
      invalid("attached speech");
    if (item.envelope !== undefined) {
      if (!Array.isArray(item.envelope) || item.envelope.length > 512) invalid("audio envelope");
      let previous = -1;
      for (const point of item.envelope) {
        if (
          !record(point) ||
          !finite(point.time) ||
          point.time < 0 ||
          point.time <= previous ||
          !positive(item.duration) ||
          point.time > item.duration ||
          !finite(point.value) ||
          point.value < 0 ||
          point.value > 3.98
        )
          invalid("audio envelope point");
        previous = point.time;
      }
    }
    audio.push({
      id: String(item.id),
      asset_id: item.asset_id,
      start: numeric(item.start),
      duration: numeric(item.duration),
      source_in: numeric(item.source_in),
      volume: optionalNumber(item.volume),
      scene_id: optionalString(item.scene_id),
      envelope: Array.isArray(item.envelope)
        ? item.envelope.map((point) => ({ time: numeric(point.time), value: numeric(point.value) }))
        : undefined,
    });
  }
  let captions: CanonicalCompositionPlan["captions"];
  if (value.captions !== undefined) {
    if (
      !record(value.captions) ||
      !Array.isArray(value.captions.groups) ||
      !record(value.captions.style)
    )
      invalid("captions");
    if (
      value.captions.font_asset_id !== undefined &&
      assetById.get(String(value.captions.font_asset_id))?.kind !== "font"
    )
      invalid("caption font");
    if (value.captions.groups.length > 20000) invalid("caption count");
    if (
      value.captions.font_size_px !== undefined &&
      (!positive(value.captions.font_size_px) || value.captions.font_size_px > 4096)
    )
      invalid("caption font size");
    const groups: { text: string; start: number; end: number }[][] = [];
    for (const group of value.captions.groups) {
      if (!Array.isArray(group)) invalid("caption group");
      const words: { text: string; start: number; end: number }[] = [];
      for (const word of group) {
        if (
          !record(word) ||
          typeof word.text !== "string" ||
          word.text.length > 5000 ||
          !finite(word.start) ||
          word.start < 0 ||
          !finite(word.end) ||
          word.end <= word.start ||
          word.end > value.duration + 0.002
        )
          invalid("caption word");
        words.push({ text: word.text, start: word.start, end: word.end });
      }
      groups.push(words);
    }
    captions = {
      groups,
      style: captionStyle(value.captions.style),
      font_asset_id: optionalString(value.captions.font_asset_id),
      font_size_px: optionalNumber(value.captions.font_size_px),
    };
  }
  const overlays: CanonicalOverlay[] = [];
  if (value.overlays !== undefined) {
    if (!Array.isArray(value.overlays)) invalid("overlays");
    for (const item of value.overlays) {
      if (!record(item)) invalid("overlay");
      claim(item.id);
      window(item, value.duration);
      if (!finite(item.x) || !finite(item.y) || !positive(item.width) || !positive(item.height))
        invalid("overlay geometry");
      if (item.asset_id !== undefined && assetById.get(String(item.asset_id))?.kind !== "image")
        invalid("overlay image");
      if (
        (item.text !== undefined && typeof item.text !== "string") ||
        (item.text === undefined && item.asset_id === undefined)
      )
        invalid("overlay content");
      if (
        item.opacity !== undefined &&
        (!finite(item.opacity) || item.opacity < 0 || item.opacity > 1)
      )
        invalid("overlay opacity");
      if (item.font_size !== undefined && !positive(item.font_size)) invalid("overlay font size");
      if (
        item.font_asset_id !== undefined &&
        assetById.get(String(item.font_asset_id))?.kind !== "font"
      )
        invalid("overlay font");
      if (item.align !== undefined && !["left", "center", "right"].includes(String(item.align)))
        invalid("overlay alignment");
      for (const field of ["color", "background"])
        if (
          item[field] !== undefined &&
          (typeof item[field] !== "string" || !/^(#[\da-f]{3,8}|transparent)$/i.test(item[field]))
        )
          invalid("overlay color");
      overlays.push({
        id: String(item.id),
        asset_id: optionalString(item.asset_id),
        text: optionalString(item.text),
        start: numeric(item.start),
        duration: numeric(item.duration),
        x: numeric(item.x),
        y: numeric(item.y),
        width: numeric(item.width),
        height: numeric(item.height),
        opacity: optionalNumber(item.opacity),
        font_size: optionalNumber(item.font_size),
        font_asset_id: optionalString(item.font_asset_id),
        color: optionalString(item.color),
        background: optionalString(item.background),
        align: alignment(item.align),
      });
    }
  }
  return {
    schema_version: 1,
    title: value.title,
    width: value.width,
    height: value.height,
    duration: value.duration,
    dynamic_range: dynamicRange,
    assets,
    scenes,
    audio,
    captions,
    overlays,
  };
}

function localPath(value: string): string {
  if (!/^(assets|vendor)\/[a-zA-Z0-9_./-]+$/.test(value) || value.split("/").includes(".."))
    invalid("materialized asset path");
  return value;
}
function timing(start: number, duration: number, track: number) {
  return `class="clip" data-start="${start}" data-duration="${duration}" data-track-index="${track}"`;
}
function document(
  title: string,
  root: string,
  width: number,
  height: number,
  duration: number,
  content: string,
  css: string,
  animation: string,
) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><script src="vendor/gsap.min.js"></script><style>body{margin:0}#${root}{position:relative;width:${width}px;height:${height}px;overflow:hidden}.canonical-stage{position:absolute;inset:0;overflow:hidden}.canonical-video{position:absolute;inset:0;width:100%;height:100%}${css}</style></head><body><div id="${root}" data-composition-id="${root}" data-width="${width}" data-height="${height}" data-duration="${duration}"><div id="${root}-background" class="canonical-background" style="position:absolute;inset:0;background:#000"></div>${content}</div><script>window.__timelines["${root}"]=gsap.timeline({paused:true}).to({}, {duration:${duration}});${animation}</script></body></html>`;
}

/** One persisted editable composition is the source of both automatic and manual renders. */
export function compileCanonicalComposition(
  input: CanonicalCompositionPlan,
  paths: Map<string, CanonicalAssetPath>,
): CanonicalComposition {
  const plan = parseCanonicalComposition(input);
  const assets = new Map(plan.assets.map((asset) => [asset.id, asset]));
  const path = (assetId: string) => {
    const value = paths.get(assetId);
    if (!value) invalid("asset not materialized");
    return localPath(typeof value === "string" ? value : value.path);
  };
  const media = (assetId: string) => {
    const value = paths.get(assetId);
    const preview =
      typeof value === "object" && value.previewPath
        ? ` data-preview-src="${localPath(value.previewPath)}"`
        : "";
    return `src="${path(assetId)}"${preview}`;
  };
  const audioMarkup = (entry: CanonicalAudio, start = entry.start) => {
    const envelope = entry.envelope?.length
      ? ` data-automation="${escape(JSON.stringify({ version: 1, lanes: [{ target: "volume", points: entry.envelope.map((point) => ({ t: point.time, v: point.value })) }] }))}"`
      : "";
    return `<audio id="audio-${entry.id}${entry.scene_id ? "-audio" : ""}" ${timing(start, entry.duration, 1)} data-label="${escape(assets.get(entry.asset_id)!.name)}" data-media-start="${entry.source_in}" data-source-duration="${assets.get(entry.asset_id)!.duration}" data-volume="${entry.volume ?? 1}"${envelope} ${media(entry.asset_id)} preload="metadata"></audio>`;
  };
  const captionMarkup = (
    root: string,
    groups: NonNullable<CanonicalCompositionPlan["captions"]>["groups"],
  ) => {
    let html = "",
      css = "",
      animation = "";
    for (const [index, words] of groups.entries()) {
      const caption = storyCaptionMarkup(
        {
          render_options: { caption_mode: "all", caption_style: plan.captions?.style },
          timeline: [{ audio: {}, words }],
        },
        plan,
      );
      const prefix = `caption-${root}-${index}-`;
      const byWord = plan.captions?.style.preset === "word-by-word";
      const identified = caption.html.replace(
        /id="story-caption-(\d+)-word-(\d+)"/g,
        (attribute, cueIndex, wordIndex) => {
          const word = words[(byWord ? Number(cueIndex) : Number(wordIndex)) - 1];
          return word
            ? `${attribute} data-canonical-word="${root}:${word.start.toFixed(3)}:${word.end.toFixed(3)}"`
            : attribute;
        },
      );
      html += identified.replace(/story-caption-(?=\d)/g, prefix);
      css = caption.css.replace("z-index:3", "z-index:2000");
      if (plan.captions?.font_size_px !== undefined)
        css = css.replace(/font-size:[\d.]+px/, `font-size:${plan.captions.font_size_px}px`);
      animation += (caption.animation ?? "")
        .replace(/story-caption-(?=\d)/g, prefix)
        .replaceAll('["main"]', `["${root}"]`);
    }
    if (plan.captions?.font_asset_id)
      css = css.replaceAll("assets/caption-font.ttf", path(plan.captions.font_asset_id));
    else
      css = css
        .replace(/@font-face\{[^}]+\}/, "")
        .replaceAll("font-family:SneepCaption", "font-family:Arial,sans-serif");
    return { html, css, animation };
  };
  const files = new Map<string, string>();
  const hosts: string[] = [];
  let rootAnimations = "";
  for (const [index, scene] of plan.scenes.entries()) {
    if (scene.role === "bridge") continue;
    const asset = assets.get(scene.asset_id)!;
    const root = `source-scene-${index + 1}`;
    const videoId = `${root}-video`;
    const cropStyle = (geometry: CanonicalCrop) =>
      `inset:auto;width:${(asset.width! / geometry.width) * 100}%;height:${(asset.height! / geometry.height) * 100}%;left:${(-geometry.x / geometry.width) * 100}%;top:${(-geometry.y / geometry.height) * 100}%;object-fit:fill`;
    const firstCrop = scene.crop ?? scene.crop_keyframes?.[0];
    const style = firstCrop ? cropStyle(firstCrop) : `object-fit:${scene.fit ?? "contain"}`;
    let animations = "";
    for (const frame of scene.crop_keyframes ?? []) {
      const values = {
        width: `${(asset.width! / frame.width) * 100}%`,
        height: `${(asset.height! / frame.height) * 100}%`,
        left: `${(-frame.x / frame.width) * 100}%`,
        top: `${(-frame.y / frame.height) * 100}%`,
      };
      animations += `window.__timelines["${root}"].set("#${videoId}",${JSON.stringify(values)},${scene.source_in + frame.time});`;
    }
    const attached = plan.audio.filter((entry) => entry.scene_id === scene.id);
    const cameraAudio = attached
      .map((entry) => {
        // A full aligned clean/source track lets trim handles reveal the same camera audio.
        if (
          !entry.envelope?.length &&
          Math.abs(entry.source_in - scene.source_in) < 0.002 &&
          assets.get(entry.asset_id)!.duration! >= asset.duration!
        )
          return audioMarkup({ ...entry, source_in: 0, duration: asset.duration! }, 0);
        return audioMarkup(entry, scene.source_in);
      })
      .join("");
    const captions = captionMarkup(
      root,
      attached.length
        ? (plan.captions?.groups ?? [])
            .map((group) =>
              group
                .filter(
                  (word) =>
                    word.start >= scene.start - 0.002 &&
                    word.start < scene.start + scene.duration - 0.002,
                )
                .map((word) => ({
                  ...word,
                  start: word.start - scene.start + scene.source_in,
                  end: word.end - scene.start + scene.source_in,
                })),
            )
            .filter((group) => group.length)
        : [],
    );
    const bridges = plan.scenes
      .filter((entry) => entry.parent_scene_id === scene.id)
      .map(
        (bridge) =>
          `<video id="bridge-${bridge.id}" class="clip canonical-video" data-start="${scene.source_in + bridge.start - scene.start}" data-duration="${bridge.duration}" data-track-index="0" data-media-start="${bridge.source_in}" data-source-duration="${assets.get(bridge.asset_id)!.duration}" data-has-audio="false" ${media(bridge.asset_id)} style="z-index:1;object-fit:contain" muted playsinline preload="metadata"></video>`,
      )
      .join("");
    const content = `<video id="${videoId}" class="clip canonical-video source-video" data-canonical-scene="${scene.id}" data-canonical-asset="${scene.asset_id}" data-start="0" data-duration="${asset.duration}" data-track-index="0" data-media-start="0" data-source-duration="${asset.duration}" data-has-audio="false" ${media(scene.asset_id)} style="${style}" muted playsinline preload="metadata"></video>${bridges}${cameraAudio}${captions.html}`;
    files.set(
      `${root}.html`,
      document(
        asset.name,
        root,
        plan.width,
        plan.height,
        asset.duration!,
        content,
        captions.css,
        animations + captions.animation,
      ),
    );
    hosts.push(
      `<div id="scene-${scene.id}" class="clip canonical-stage source-video" data-canonical-scene="${scene.id}" data-canonical-asset="${scene.asset_id}" data-label="${escape(asset.name)}" data-source-window data-composition-id="${root}" data-composition-src="${root}.html" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="0" data-playback-start="${scene.source_in}" data-source-duration="${asset.duration}" data-width="${plan.width}" data-height="${plan.height}" style="z-index:${index + 1}"></div>`,
    );
    // Fade only the picture group; independent captions and branding retain their clock.
    if (scene.fade_in)
      rootAnimations += `window.__timelines["main"].fromTo("#${videoId},#${root}-background",{opacity:0},{opacity:1,duration:${scene.fade_in},ease:"none",immediateRender:false},${scene.start});`;
    if (scene.fade_out)
      rootAnimations += `window.__timelines["main"].to("#${videoId},#${root}-background",{opacity:0,duration:${scene.fade_out},ease:"none"},${scene.start + scene.duration - scene.fade_out});`;
  }
  hosts.push(...plan.audio.filter((entry) => !entry.scene_id).map((entry) => audioMarkup(entry)));
  let css = "";
  if (plan.captions?.groups.length) {
    const attachedScenes = plan.scenes.filter((scene) =>
      plan.audio.some((entry) => entry.scene_id === scene.id),
    );
    const caption = captionMarkup(
      "main",
      plan.captions.groups
        .map((group) =>
          group.filter(
            (word) =>
              !attachedScenes.some(
                (scene) =>
                  word.start >= scene.start - 0.002 &&
                  word.start < scene.start + scene.duration - 0.002,
              ),
          ),
        )
        .filter((group) => group.length),
    );
    css += caption.css;
    hosts.push(caption.html);
    rootAnimations += caption.animation ?? "";
  }
  for (const overlay of plan.overlays ?? []) {
    const font = overlay.font_asset_id ? `overlay-${overlay.id}` : "Arial,sans-serif";
    if (overlay.font_asset_id)
      css += `@font-face{font-family:${font};src:url("${path(overlay.font_asset_id)}");font-display:block}`;
    const style = `position:absolute;left:${overlay.x}px;top:${overlay.y}px;width:${overlay.width}px;height:${overlay.height}px;opacity:${overlay.opacity ?? 1};z-index:3000;object-fit:contain;white-space:pre-wrap;overflow-wrap:anywhere;color:${overlay.color ?? "#ffffff"};background:${overlay.background ?? "transparent"};font:${overlay.font_size ?? 24}px/1.2 ${font};text-align:${overlay.align ?? "center"}`;
    hosts.push(
      overlay.asset_id
        ? `<img id="overlay-${overlay.id}" data-canonical-overlay="${overlay.id}" ${timing(overlay.start, overlay.duration, 4)} src="${path(overlay.asset_id)}" style="${style}">`
        : `<div id="overlay-${overlay.id}" data-canonical-overlay="${overlay.id}" ${timing(overlay.start, overlay.duration, 4)} style="${style}">${escape(overlay.text ?? "")}</div>`,
    );
  }
  const html = document(
    plan.title,
    "main",
    plan.width,
    plan.height,
    plan.duration,
    hosts.join("\n"),
    css,
    rootAnimations,
  );
  const renderOptions: CanonicalComposition["renderOptions"] = {
    hdrMode: plan.dynamic_range === "hdr" ? "force-hdr" : "force-sdr",
  };
  files.set("index.html", html);
  files.set("render-config.json", JSON.stringify(renderOptions));
  files.set("composition-plan.json", JSON.stringify(plan));
  return { html, files, renderOptions };
}
