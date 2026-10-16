import { parseGsapScriptAcorn } from "@hyperframes/core/gsap-parser-acorn";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import {
  addAnimationToScript,
  removeAnimationFromScript,
  removePropertyFromAnimation,
} from "@hyperframes/core/gsap-writer-acorn";
import { cutMediaElement } from "./sourceCutMediaSettings";
import { findGsapScriptElements } from "./gsapSoftReload";

const STATIC_PROPERTIES = new Set([
  "x",
  "y",
  "z",
  "xPercent",
  "yPercent",
  "width",
  "height",
  "rotation",
  "rotationX",
  "rotationY",
  "scale",
  "scaleX",
  "scaleY",
  "skewX",
  "skewY",
  "transformOrigin",
  "opacity",
  "autoAlpha",
  "borderRadius",
  "filter",
  "clipPath",
]);
const PRESENTATION_ATTRIBUTES = new Set([
  "data-cut-brightness",
  "data-cut-contrast",
  "data-cut-saturation",
  "data-cut-sharpen",
  "data-cut-original-filter",
  "data-x",
  "data-y",
  "data-hf-edit-base-x",
  "data-hf-edit-base-y",
  ...[
    "path-offset",
    "box-size",
    "rotation",
    "original-translate",
    "original-inline-translate",
    "original-width",
    "original-height",
    "original-box-width",
    "original-box-height",
    "original-min-width",
    "original-min-height",
    "original-max-width",
    "original-max-height",
    "original-flex-basis",
    "original-flex-grow",
    "original-flex-shrink",
    "original-box-sizing",
    "original-scale",
    "original-transform-origin",
    "original-display",
    "original-rotate",
    "original-inline-rotate",
    "original-rotation-transform-origin",
    "original-transform-display",
  ].map((name) => `data-hf-studio-${name}`),
]);

function hasAssetReference(value: string): boolean {
  return /url\s*\(/i.test(value);
}

function hasUnsupportedStyleReference(value: string, sharpenId: string | undefined): boolean {
  return hasAssetReference(
    sharpenId
      ? value.replaceAll(
          new RegExp(
            `url\\(\\s*["']?#${sharpenId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*\\)`,
            "g",
          ),
          "",
        )
      : value,
  );
}

function copyColorGrading(from: HTMLElement, to: HTMLElement) {
  const name = "data-color-grading";
  try {
    const source = JSON.parse(from.getAttribute(name) || "null");
    const destination = JSON.parse(to.getAttribute(name) || "null");
    const result = { ...source };
    // LUT files stay owned by their source composition, just like linked masks.
    delete result.lut;
    if (destination?.lut) result.lut = destination.lut;
    if (Object.keys(result).length) to.setAttribute(name, JSON.stringify(result));
    else to.removeAttribute(name);
  } catch {
    /* Leave unrecognized grading data with its original cut. */
  }
}

function staticMediaSets(doc: Document, script: string, media: HTMLElement): GsapAnimation[] {
  return (parseGsapScriptAcorn(script)?.animations ?? []).filter((animation) => {
    if (
      animation.method !== "set" ||
      animation.keyframes ||
      animation.hasUnresolvedKeyframes ||
      (animation.provenance && animation.provenance.kind !== "literal") ||
      (!animation.global && (animation.resolvedStart ?? animation.position) !== 0)
    )
      return false;
    try {
      const targets = doc.querySelectorAll(animation.targetSelector);
      return targets.length === 1 && targets[0] === media;
    } catch {
      return false;
    }
  });
}

function copyStaticLayout(
  source: Document,
  destination: Document,
  from: HTMLElement,
  to: HTMLElement,
) {
  const sourceScripts = findGsapScriptElements(source);
  const destinationScripts = findGsapScriptElements(destination);
  if (sourceScripts.length > 1 || destinationScripts.length > 1 || !to.id)
    throw new Error("This cut needs one editable animation timeline to copy its static layout.");
  const values: Record<string, number | string> = {};
  const sourceSets = staticMediaSets(source, sourceScripts[0]?.textContent ?? "", from);
  const destinationSets = staticMediaSets(
    destination,
    destinationScripts[0]?.textContent ?? "",
    to,
  );
  const linkedProperties = new Set(
    [...sourceSets, ...destinationSets].flatMap((animation) =>
      Object.entries(animation.properties)
        .filter(([, value]) => hasAssetReference(String(value)))
        .map(([name]) => name),
    ),
  );
  for (const animation of sourceSets) {
    for (const [name, value] of Object.entries(animation.properties)) {
      if (STATIC_PROPERTIES.has(name) && !linkedProperties.has(name)) values[name] = value;
    }
  }
  const script = destinationScripts[0];
  if (!script) {
    if (Object.keys(values).length)
      throw new Error("This cut needs an editable animation timeline to copy its static layout.");
    return;
  }
  let next = script.textContent ?? "";
  const currentValues: Record<string, number | string> = {};
  for (const animation of staticMediaSets(destination, next, to)) {
    for (const [name, value] of Object.entries(animation.properties)) {
      if (STATIC_PROPERTIES.has(name) && !linkedProperties.has(name)) currentValues[name] = value;
    }
  }
  if (
    Object.keys(currentValues).length === Object.keys(values).length &&
    Object.entries(values).every(([name, value]) => currentValues[name] === value)
  )
    return;
  for (const animation of staticMediaSets(destination, next, to)) {
    const properties = Object.keys(animation.properties).filter(
      (name) => STATIC_PROPERTIES.has(name) && !linkedProperties.has(name),
    );
    if (!properties.length) continue;
    if (properties.length === Object.keys(animation.properties).length) {
      next = removeAnimationFromScript(next, animation.id);
    } else {
      // Property removal changes content-based parser IDs, so re-resolve the same set.
      for (const name of properties) {
        const current = staticMediaSets(destination, next, to).find(
          (item) => name in item.properties && item.targetSelector === animation.targetSelector,
        );
        if (current) next = removePropertyFromAnimation(next, current.id, name);
      }
    }
  }
  if (Object.keys(values).length) {
    const result = addAnimationToScript(next, {
      targetSelector: `[id=${JSON.stringify(to.id)}]`,
      method: "set",
      position: 0,
      global: true,
      properties: values,
    });
    if (!result.id) throw new Error("Could not copy this cut's static layout.");
    next = result.script;
  }
  script.textContent = next;
}

/** Copies authored presentation only; media, sound, clocks and animated keyframes stay local. */
export function patchCutPresentation(html: string, selectedSource: string | undefined): string {
  if (!selectedSource || html === selectedSource) return html;
  const source = new DOMParser().parseFromString(selectedSource, "text/html");
  const destination = new DOMParser().parseFromString(html, "text/html");
  const from = cutMediaElement(source, "visual");
  const to = cutMediaElement(destination, "visual");
  if (!from || !to) return html;
  copyStaticLayout(source, destination, from, to);
  const sourceSharpen = source.querySelector("svg[data-cut-sharpen-filter]");
  const oldSharpen = destination.querySelector("svg[data-cut-sharpen-filter]");
  const sourceSharpenId = sourceSharpen?.querySelector("filter")?.id;
  const destinationSharpenId = oldSharpen?.querySelector("filter")?.id;
  const linkedStyles = new Set(
    [...new Set([...Array.from(from.style), ...Array.from(to.style)])].filter(
      (name) =>
        hasUnsupportedStyleReference(from.style.getPropertyValue(name), sourceSharpenId) ||
        hasUnsupportedStyleReference(to.style.getPropertyValue(name), destinationSharpenId),
    ),
  );
  for (const name of new Set([...Array.from(from.style), ...Array.from(to.style)])) {
    if (linkedStyles.has(name)) continue;
    to.style.setProperty(
      name,
      from.style.getPropertyValue(name),
      from.style.getPropertyPriority(name),
    );
  }
  copyColorGrading(from, to);
  for (const name of new Set([...from.getAttributeNames(), ...to.getAttributeNames()])) {
    if (
      !PRESENTATION_ATTRIBUTES.has(name) ||
      (linkedStyles.has("filter") && name.startsWith("data-cut-"))
    )
      continue;
    if (from.hasAttribute(name)) to.setAttribute(name, from.getAttribute(name)!);
    else to.removeAttribute(name);
  }
  // Sharpen's SVG is local to each composition; preserve its destination identity.
  if (sourceSharpen && !linkedStyles.has("filter")) {
    const copy = destination.importNode(sourceSharpen, true);
    const oldId = copy.querySelector("filter")?.id;
    const newId = `${to.id || "source-video"}-cut-sharpen`;
    if (oldId) {
      copy.querySelector("filter")!.id = newId;
      to.style.filter = to.style.filter.replaceAll(`#${oldId}`, `#${newId}`);
    }
    if (oldSharpen) oldSharpen.replaceWith(copy);
    else to.parentElement?.append(copy);
  } else if (!linkedStyles.has("filter")) oldSharpen?.remove();
  const result = `<!doctype html>\n${destination.documentElement.outerHTML}`;
  const previous = new DOMParser().parseFromString(html, "text/html");
  return previous.documentElement.outerHTML === destination.documentElement.outerHTML
    ? html
    : result;
}
