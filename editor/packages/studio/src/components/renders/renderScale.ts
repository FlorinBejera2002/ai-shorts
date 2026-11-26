import { CANVAS_DIMENSIONS } from "@hyperframes/parsers";
import { t } from "../../i18n/translate";
import type { ResolutionPreset } from "./useRenderQueue";

export interface CompositionDimensions {
  width: number;
  height: number;
}

// Orientation is derived from the composition's authored aspect ratio,
// not chosen by the user: picking "1080p portrait" for a landscape comp
// would just produce a wrong-aspect render.
export type RenderScale = "auto" | "1080p" | "4k";

export const SCALE_OPTION_ORDER: RenderScale[] = ["auto", "1080p", "4k"];

const SCALE_LABEL: Record<RenderScale, string> = {
  auto: "Auto",
  "1080p": "1080p",
  "4k": "4K",
};

export type CompAspect = "landscape" | "portrait" | "square";

export function compAspect(dims: CompositionDimensions | null | undefined): CompAspect {
  // Missing dims fall through to landscape (legacy default — "landscape" was
  // the first preset). Studio shows resolved dims inline, so the user can see
  // when this fallback is in effect.
  if (dims == null) return "landscape";
  if (dims.width === dims.height) return "square";
  return dims.height > dims.width ? "portrait" : "landscape";
}

export function resolveResolution(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
): ResolutionPreset | "auto" {
  if (scale === "auto") return "auto";
  const aspect = compAspect(dims);
  if (scale === "1080p") return aspect;
  return aspect === "landscape"
    ? "landscape-4k"
    : aspect === "portrait"
      ? "portrait-4k"
      : "square-4k";
}

export function resolvedDimensions(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
): CompositionDimensions | null {
  if (scale === "auto") return dims ?? null;
  const preset = resolveResolution(scale, dims);
  return preset === "auto" ? null : CANVAS_DIMENSIONS[preset];
}

// Mirrors the producer's resolveDeviceScaleFactor validation
// (renderOrchestrator.ts:608): the chosen preset must match the comp's aspect
// ratio exactly (cross-multiplied), can't downsample, and must be an integer
// scale factor. Without this guard the user can pick a preset that throws at
// render time — e.g. 1080p on a 1080×1080 square or 1080p on a 1280×720 comp
// (1.5× isn't integer).
export function scaleApplies(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
): boolean {
  if (scale === "auto" || dims == null) return true;
  const preset = resolveResolution(scale, dims);
  if (preset === "auto") return true;
  const target = CANVAS_DIMENSIONS[preset];
  if (target.width * dims.height !== target.height * dims.width) return false;
  if (target.width < dims.width) return false;
  return Number.isInteger(target.width / dims.width);
}

export function scaleOptionLabel(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
): string {
  const resolved = resolvedDimensions(scale, dims);
  const label = scale === "auto" ? t("output.scaleAuto") : SCALE_LABEL[scale];
  const base = resolved ? `${label} · ${resolved.width}×${resolved.height}` : label;
  // Explain *why* an option is disabled instead of greying it silently:
  // the preset must be an exact integer upscale of the authored size.
  if (dims && !scaleApplies(scale, dims)) {
    return t("output.scaleNotInteger", { base, dims: `${dims.width}×${dims.height}` });
  }
  return base;
}

/**
 * Short label for the size a render came out at ("1080p", "4K"): the preset when one was
 * chosen, else the composition's own size. `null` when neither is known.
 */
export function renderSizeLabel(
  resolution: ResolutionPreset | "auto" | undefined,
  dims: CompositionDimensions | null | undefined,
): string | null {
  const size = resolution && resolution !== "auto" ? CANVAS_DIMENSIONS[resolution] : dims;
  if (!size) return null;
  const short = Math.min(size.width, size.height);
  return short >= 2160 ? "4K" : `${short}p`;
}

/** Clip length as the boards print it: "0:08", "1:05", "12:30". `null` when unknown. */
export function formatClipDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * "0:08 · 1080p · 30 fps" line under the export progress and result: the clip length, the
 * size it came out at and its frame rate. A job without a recorded size rendered at Auto,
 * so it takes the composition's own size.
 */
export function renderMetaParts(
  job: { resolution?: ResolutionPreset | "auto"; fps?: number },
  dims: CompositionDimensions | null | undefined,
  durationSeconds?: number | null,
): string[] {
  const parts: string[] = [];
  const duration = formatClipDuration(durationSeconds);
  if (duration) parts.push(duration);
  const size = renderSizeLabel(job.resolution ?? "auto", dims);
  if (size) parts.push(size);
  if (job.fps) parts.push(t("output.fpsOption", { fps: job.fps }));
  return parts;
}
