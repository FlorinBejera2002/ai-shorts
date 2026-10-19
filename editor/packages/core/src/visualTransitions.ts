import { readClipTiming } from "./compositionContract";
import { resolveAuthoredTimingWindow } from "./runtime/authoredTiming";
import { readElementPlaybackRate, readMediaStart } from "./runtime/playbackRate";
import { isHtmlElement } from "./runtime/domRealm";
import { HF_COLOR_GRADING_ATTR, COLOR_GRADING_AUTHORED_OPACITY_ATTR } from "./colorGrading";

/** Persisted on source hosts; the pictures below are always derived from their current edits. */
export const VISUAL_TRANSITION_ATTR = "data-transition-in";
export const DERIVED_TRANSITION_ATTR = "data-hf-visual-transition";
const HOST_SELECTOR = "[data-source-window][data-canonical-scene]";
const DERIVED_SELECTOR = `[${DERIVED_TRANSITION_ATTR}]`;

interface Shot {
  host: Element;
  picture: Element;
  start: number;
  duration: number;
  sourceIn: number;
  rate: number;
}

function number(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function shot(host: Element): Shot | null {
  const start = readClipTiming(host).start ?? 0;
  const duration = resolveAuthoredTimingWindow({
    start,
    duration: host.getAttribute("data-duration"),
    end: host.getAttribute("data-end"),
    authoredDuration:
      !host.hasAttribute("data-duration") && host.hasAttribute("data-end")
        ? null
        : host.getAttribute("data-hf-authored-duration"),
    authoredEnd: host.getAttribute("data-hf-authored-end"),
  })?.duration;
  const picture = Array.from(host.querySelectorAll("video[data-canonical-scene]")).find(
    (node) => node.closest(HOST_SELECTOR) === host,
  );
  if (!picture || duration == null || duration <= 0 || host.hasAttribute("data-hidden"))
    return null;
  return {
    host,
    picture,
    start,
    duration,
    sourceIn: readMediaStart(host),
    rate: readElementPlaybackRate(host),
  };
}

function attributes(element: Element, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) element.setAttribute(name, value);
}

function boundaryPicture(
  doc: Document,
  active: Shot,
  source: Shot,
  incoming: Shot,
  duration: number,
  before: boolean,
  signature: string,
): void {
  const half = duration / 2;
  const localStart = before ? active.duration - half : 0;
  const side = before ? "before" : "after";
  const layer = doc.createElement("div");
  attributes(layer, {
    [DERIVED_TRANSITION_ATTR]: side,
    "data-transition-signature": signature,
    "data-transition-owner": incoming.host.id,
    "data-transition-picture": source.picture.id,
    "data-transition-duration": String(duration),
    "aria-hidden": "true",
    style: "position:absolute;inset:0;z-index:2;pointer-events:none;background:#000;opacity:0",
  });
  // Create only a picture. Copying a scene would duplicate captions and speech.
  const picture = doc.createElement("video");
  for (const attr of Array.from(source.picture.attributes)) {
    if (
      ["id", "class", "style", "autoplay", "loop", "controls"].includes(attr.name) ||
      (attr.name.startsWith("data-") &&
        ![
          "data-src",
          "data-preview-src",
          "data-source-duration",
          HF_COLOR_GRADING_ATTR,
          COLOR_GRADING_AUTHORED_OPACITY_ATTR,
        ].includes(attr.name))
    )
      continue;
    picture.setAttribute(attr.name, attr.value);
  }
  for (const sourceElement of source.picture.querySelectorAll("source"))
    picture.appendChild(sourceElement.cloneNode(true));
  const sourceEnd = source.sourceIn + source.duration * source.rate;
  const assetEnd = number(source.host.getAttribute("data-source-duration")) ?? sourceEnd;
  attributes(picture, {
    id: `hf-transition-${incoming.host.id}-${side}`,
    class: "clip",
    "data-start": String(active.sourceIn + localStart * active.rate),
    "data-duration": String(half * active.rate),
    "data-media-start": "0",
    // An exclusive selected end must use its preceding frame, including interior trims.
    "data-freeze-at": String(
      before
        ? source.sourceIn
        : Math.max(source.sourceIn, Math.min(sourceEnd, assetEnd) - 0.000001),
    ),
    "data-has-audio": "false",
    muted: "",
    playsinline: "",
    // The runtime warms only nearby boundary pictures, not every cut's decoder.
    preload: "none",
    style: source.picture.getAttribute("style") ?? "",
  });
  if (isHtmlElement(picture)) {
    picture.style.position = "absolute";
    if (!picture.style.inset && !picture.style.left) picture.style.inset = "0";
    if (!picture.style.width) picture.style.width = "100%";
    if (!picture.style.height) picture.style.height = "100%";
  }
  layer.appendChild(picture);
  active.host.appendChild(layer);
}

/** Lower native transition metadata before source-window projection/media extraction.
 * The nominal shot, audio and caption clocks remain untouched. Each side holds only
 * an included boundary picture, over the opaque currently playing shot.
 */
export function lowerVisualTransitions(doc: Document): void {
  const groups = new Map<Element, Shot[]>();
  for (const host of doc.querySelectorAll(HOST_SELECTOR)) {
    const entry = shot(host);
    if (!entry || !host.parentElement) continue;
    const siblings = groups.get(host.parentElement) ?? [];
    siblings.push(entry);
    groups.set(host.parentElement, siblings);
  }
  const retained = new Set<Element>();
  for (const siblings of groups.values()) {
    siblings.sort((left, right) => left.start - right.start);
    for (let index = 1; index < siblings.length; index++) {
      const left = siblings[index - 1]!;
      const right = siblings[index]!;
      const requested = number(right.host.getAttribute(VISUAL_TRANSITION_ATTR)) ?? 0;
      const duration = Math.min(requested, left.duration / 2, right.duration / 2);
      if (duration <= 0 || Math.abs(left.start + left.duration - right.start) > 0.002) continue;
      if (
        left.host.hasAttribute("data-transition-blocked") ||
        right.host.hasAttribute("data-transition-blocked")
      )
        continue;
      if (
        left.host.getAttribute("data-canonical-asset") ===
          right.host.getAttribute("data-canonical-asset") &&
        Math.abs(left.sourceIn + left.duration * left.rate - right.sourceIn) <= 0.002
      )
        continue;
      const signature = JSON.stringify([
        duration,
        ...[left, right].map((entry) => [
          entry.host.id,
          entry.start,
          entry.duration,
          entry.sourceIn,
          entry.rate,
          entry.picture.id,
        ]),
      ]);
      const existing = Array.from(doc.querySelectorAll(DERIVED_SELECTOR)).filter(
        (element) => element.getAttribute("data-transition-owner") === right.host.id,
      );
      if (
        existing.length !== 2 ||
        existing.some((element) => element.getAttribute("data-transition-signature") !== signature)
      ) {
        for (const element of existing) element.remove();
        boundaryPicture(doc, left, right, right, duration, true, signature);
        boundaryPicture(doc, right, left, right, duration, false, signature);
        for (const element of doc.querySelectorAll(DERIVED_SELECTOR))
          if (element.getAttribute("data-transition-owner") === right.host.id)
            retained.add(element);
      } else {
        for (const element of existing) {
          retained.add(element);
          const source =
            element.getAttribute(DERIVED_TRANSITION_ATTR) === "before"
              ? right.picture
              : left.picture;
          const picture = element.querySelector("video");
          if (!picture) continue;
          // Asset localization/proxy selection must not replace the producer's
          // already assigned render ids after its extraction list is compiled.
          for (const name of ["src", "data-src", "data-preview-src"]) {
            const value = source.getAttribute(name);
            if (picture.getAttribute(name) === value) continue;
            if (value == null) picture.removeAttribute(name);
            else picture.setAttribute(name, value);
          }
        }
      }
    }
  }
  for (const element of doc.querySelectorAll(DERIVED_SELECTOR))
    if (!retained.has(element)) element.remove();
}

function absoluteStart(host: Element): number {
  let start = readClipTiming(host).start ?? 0;
  for (let ancestor = host.parentElement; ancestor; ancestor = ancestor.parentElement)
    if (ancestor.hasAttribute("data-composition-id")) start += readClipTiming(ancestor).start ?? 0;
  return start;
}

/** Called after animation seek: inherit current crop/grade edits without persisting clones.
 * One opaque base plus one alpha layer is a dissolve; two fading layers dip to black.
 */
export function syncVisualTransitions(doc: Document, time: number): void {
  for (const layer of doc.querySelectorAll(DERIVED_SELECTOR)) {
    const owner = doc.getElementById(layer.getAttribute("data-transition-owner") ?? "");
    if (!owner || !isHtmlElement(layer)) continue;
    const duration = number(layer.getAttribute("data-transition-duration")) ?? 0;
    const boundary = absoluteStart(owner);
    const before = layer.getAttribute(DERIVED_TRANSITION_ATTR) === "before";
    const progress =
      duration > 0 ? Math.max(0, Math.min(1, (time - boundary) / duration + 0.5)) : 0;
    const eased = progress * progress * (3 - 2 * progress);
    const active = before
      ? time >= boundary - duration / 2 && time < boundary
      : time >= boundary && time < boundary + duration / 2;
    const opacity = String(active ? (before ? eased : 1 - eased) : 0);
    if (layer.style.opacity !== opacity) layer.style.opacity = opacity;
    // Hidden pictures do not need crop/grade/style updates on every frame of
    // the montage. Read their current source when the boundary becomes active,
    // including direct and backward seeks, so manual edits still take effect.
    if (!active) continue;
    const source = doc.getElementById(layer.getAttribute("data-transition-picture") ?? "");
    const picture = layer.querySelector("video");
    if (!isHtmlElement(source) || !isHtmlElement(picture)) continue;
    // Animation owns crop transforms on the original. Visibility belongs to the runtime.
    const visibility = picture.style.visibility;
    const grading = source.getAttribute(HF_COLOR_GRADING_ATTR);
    if (picture.getAttribute(HF_COLOR_GRADING_ATTR) !== grading) {
      if (grading == null) picture.removeAttribute(HF_COLOR_GRADING_ATTR);
      else picture.setAttribute(HF_COLOR_GRADING_ATTR, grading);
    }
    picture.style.cssText = source.style.cssText;
    picture.style.removeProperty("display");
    picture.style.visibility = visibility;
    picture.style.position = "absolute";
    if (!picture.style.inset && !picture.style.left) picture.style.inset = "0";
    if (!picture.style.width) picture.style.width = "100%";
    if (!picture.style.height) picture.style.height = "100%";
  }
}
