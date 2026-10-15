export interface ClipAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
  volume: number;
  muted: boolean;
  hasAudio: boolean;
}

export type ClipAdjustment = Exclude<keyof ClipAdjustments, "hasAudio">;
export type ImageAdjustment = "brightness" | "contrast" | "saturation" | "sharpen";
const SVG_NS = "http://www.w3.org/2000/svg";

function numberAttribute(element: Element | null, name: string, fallback: number): number {
  const raw = element?.getAttribute(name);
  const value = raw === null || raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function cameraAudio(document: Document): HTMLMediaElement | null {
  // Processed speech replaces camera audio in imported source compositions.
  const processed = document.querySelector<HTMLAudioElement>(
    'audio[id$="-audio"]:not([data-cut-sfx])',
  );
  if (processed) return processed;
  const video = document.querySelector<HTMLVideoElement>("video.source-video");
  return video?.getAttribute("data-has-audio") === "true" ||
    video?.hasAttribute("data-cut-audio-capable")
    ? video
    : null;
}

export function readClipAdjustments(html: string): ClipAdjustments {
  const document = new DOMParser().parseFromString(html, "text/html");
  const video = document.querySelector("video.source-video");
  const audio = cameraAudio(document);
  return {
    brightness: numberAttribute(video, "data-cut-brightness", 100),
    contrast: numberAttribute(video, "data-cut-contrast", 100),
    saturation: numberAttribute(video, "data-cut-saturation", 100),
    sharpen: numberAttribute(video, "data-cut-sharpen", 0),
    volume: Math.round(numberAttribute(audio, "data-volume", 1) * 100),
    muted: audio?.getAttribute("data-cut-muted") === "true",
    hasAudio: audio !== null,
  };
}

/** The convolution is authored SVG, so the same filter paints in Chromium export. */
function writeSharpenFilter(document: Document, video: HTMLVideoElement, amount: number): string {
  const id = `${video.id || "source-video"}-cut-sharpen`;
  let svg = document.querySelector<SVGSVGElement>("svg[data-cut-sharpen-filter]");
  if (!svg) {
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("data-cut-sharpen-filter", "");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    const defs = document.createElementNS(SVG_NS, "defs");
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.id = id;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    const kernel = document.createElementNS(SVG_NS, "feConvolveMatrix");
    kernel.setAttribute("order", "3");
    kernel.setAttribute("edgeMode", "duplicate");
    kernel.setAttribute("preserveAlpha", "true");
    filter.append(kernel);
    defs.append(filter);
    svg.append(defs);
    video.parentElement!.append(svg);
  }
  const strength = amount / 100;
  const matrix = [0, -strength, 0, -strength, 1 + 4 * strength, -strength, 0, -strength, 0];
  svg.querySelector("feConvolveMatrix")!.setAttribute("kernelMatrix", matrix.join(" "));
  return `url("#${id}")`;
}

function patchImage(document: Document, property: ImageAdjustment, value: number) {
  const video = document.querySelector<HTMLVideoElement>("video.source-video");
  if (!video) throw new Error("This clip has no source video to adjust.");
  video.setAttribute(`data-cut-${property}`, String(value));
  // Keep pre-existing authored effects, but rebuild our own adjustment stack.
  if (!video.hasAttribute("data-cut-original-filter")) {
    video.setAttribute(
      "data-cut-original-filter",
      video.style.filter === "none" ? "" : video.style.filter,
    );
  }
  const brightness = numberAttribute(video, "data-cut-brightness", 100);
  const contrast = numberAttribute(video, "data-cut-contrast", 100);
  const saturation = numberAttribute(video, "data-cut-saturation", 100);
  const sharpen = numberAttribute(video, "data-cut-sharpen", 0);
  const filters = [
    video.getAttribute("data-cut-original-filter"),
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
  ];
  if (sharpen > 0) filters.push(writeSharpenFilter(document, video, sharpen));
  video.style.filter = filters.filter(Boolean).join(" ");
}

function patchSound(document: Document, property: "volume" | "muted", value: number | boolean) {
  const audio = cameraAudio(document);
  if (!audio) return;
  if (property === "volume") {
    audio.setAttribute("data-volume", String(Number(value) / 100));
    return;
  }
  const muted = Boolean(value);
  audio.setAttribute("data-cut-muted", String(muted));
  if (audio.tagName.toLowerCase() === "video") {
    audio.setAttribute("data-cut-audio-capable", "true");
    audio.setAttribute("data-has-audio", String(!muted));
    audio.toggleAttribute("muted", muted);
  } else {
    // The established audio mute contract removes hidden tracks from export.
    audio.toggleAttribute("data-hidden", muted);
  }
}

export function patchClipAdjustment(
  html: string,
  property: ClipAdjustment,
  value: number | boolean,
): string {
  const before = readClipAdjustments(html);
  const normalized =
    property === "muted"
      ? Boolean(value)
      : Math.round(
          Math.max(
            0,
            Math.min(property === "sharpen" || property === "volume" ? 100 : 200, Number(value)),
          ),
        );
  if (typeof normalized === "number" && !Number.isFinite(normalized))
    throw new Error("Choose a valid adjustment.");
  if (
    before[property] === normalized ||
    ((property === "volume" || property === "muted") && !before.hasAudio)
  )
    return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  if (property === "volume" || property === "muted") patchSound(document, property, normalized);
  else patchImage(document, property, Number(normalized));
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
