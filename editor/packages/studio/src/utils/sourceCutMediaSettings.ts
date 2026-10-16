import type { SourceCutTarget } from "./sourceCutChanges";

export type CutMediaRole = "visual" | "audio";
export type CutMediaSetting = { type: "attribute" | "style"; name: string; value: string | null };

export function cutMediaElement(root: ParentNode, role: CutMediaRole): HTMLElement | null {
  if (role === "visual") return root.querySelector<HTMLElement>("video.source-video");
  return (
    root.querySelector<HTMLElement>('audio[id$="-audio"]:not([data-cut-sfx])') ??
    root.querySelector<HTMLElement>(
      'video.source-video[data-has-audio="true"],video.source-video[data-cut-audio-capable]',
    )
  );
}

export function cutMediaRole(element: HTMLElement): CutMediaRole | null {
  if (element.matches("video.source-video")) return "visual";
  if (element.matches('audio[id$="-audio"]:not([data-cut-sfx])')) return "audio";
  return null;
}

/** Copy authored values, never source-window projected offsets or automation. */
export function authoredCutMediaSettings(
  html: string | undefined,
  role: CutMediaRole,
  settings: CutMediaSetting[],
): CutMediaSetting[] {
  const media = html && cutMediaElement(new DOMParser().parseFromString(html, "text/html"), role);
  if (!media) return settings;
  return settings.map((setting) => ({
    ...setting,
    value:
      setting.type === "attribute"
        ? media.getAttribute(setting.name)
        : media.style.getPropertyValue(setting.name) || null,
  }));
}

/** Keep an applied offset/rate inside each destination's own source bounds. */
export function boundedCutMediaSetting(
  element: Element,
  setting: CutMediaSetting,
  target: SourceCutTarget,
): CutMediaSetting {
  if (
    setting.type !== "attribute" ||
    setting.value === null ||
    !["data-media-start", "data-playback-rate"].includes(setting.name)
  )
    return setting;
  const requested = Number(setting.value);
  if (!Number.isFinite(requested)) throw new Error("Enter a finite media value.");
  const sourceDuration =
    Number(element.getAttribute("data-source-duration")) ||
    Number(element.getAttribute("data-duration"));
  const span = Math.max(0.001, target.sourceStart + target.duration * (target.playbackRate ?? 1));
  const rate = Number(element.getAttribute("data-playback-rate")) || 1;
  const offset = Number(element.getAttribute("data-media-start")) || 0;
  const max =
    setting.name === "data-media-start"
      ? Math.max(0, sourceDuration - span * rate)
      : Math.max(0.01, (sourceDuration - offset) / span);
  const min = setting.name === "data-media-start" ? 0 : 0.01;
  return {
    ...setting,
    value: String(Math.max(min, Math.min(requested, sourceDuration > 0 ? max : requested))),
  };
}

export function patchCutMediaSettings(
  html: string,
  target: SourceCutTarget,
  role: CutMediaRole,
  settings: CutMediaSetting[],
): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const media = cutMediaElement(doc, role);
  if (!media) return html;
  const before = media.outerHTML;
  for (const setting of settings) {
    const bounded = boundedCutMediaSetting(media, setting, target);
    if (bounded.type === "style") {
      if (bounded.value === null) media.style.removeProperty(bounded.name);
      else media.style.setProperty(bounded.name, bounded.value);
    } else if (bounded.value === null) media.removeAttribute(bounded.name);
    else media.setAttribute(bounded.name, bounded.value);
  }
  return media.outerHTML === before ? html : `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
