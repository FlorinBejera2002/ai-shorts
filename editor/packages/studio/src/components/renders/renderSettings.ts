const RENDER_SETTINGS_KEY = "hf-studio-render-settings";
export type RenderHdrMode = "auto" | "force-hdr" | "force-sdr";

export interface PersistedRenderSettings {
  format: "mp4" | "webm" | "mov";
  quality: "draft" | "standard" | "high";
  fps: 24 | 30 | 60;
  hdrMode: RenderHdrMode;
}

export function getPersistedRenderSettings(): PersistedRenderSettings {
  try {
    const raw = localStorage.getItem(RENDER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        format: ["mp4", "webm", "mov"].includes(parsed.format) ? parsed.format : "mp4",
        quality: ["draft", "standard", "high"].includes(parsed.quality)
          ? parsed.quality
          : "standard",
        fps: [24, 30, 60].includes(parsed.fps) ? parsed.fps : 30,
        hdrMode:
          parsed.hdrMode === "force-hdr" && parsed.format === "mp4"
            ? "force-hdr"
            : parsed.hdrMode === "force-sdr"
              ? "force-sdr"
              : "auto",
      };
    }
  } catch {
    /* ignore */
  }
  return { format: "mp4", quality: "standard", fps: 30, hdrMode: "auto" };
}

export function persistRenderSettings(
  format: PersistedRenderSettings["format"],
  quality: PersistedRenderSettings["quality"],
  fps: PersistedRenderSettings["fps"],
  hdrMode: RenderHdrMode = "auto",
): void {
  try {
    localStorage.setItem(RENDER_SETTINGS_KEY, JSON.stringify({ format, quality, fps, hdrMode }));
  } catch {
    /* ignore */
  }
}
