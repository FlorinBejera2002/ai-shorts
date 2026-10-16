import {
  captionAnimation,
  captionAnimationScript,
  type CaptionAnimation,
} from "@hyperframes/core/caption-animations";
import { EXCLUDED_TAGS, mintHfId, walkCompositionDescendants } from "@hyperframes/parsers/hf-ids";
import type { SourceCutTarget } from "./sourceCutChanges";

export interface SourceCaptionSettings {
  size: number;
  outline: boolean;
  background: boolean;
  activeWord: boolean;
  animation: CaptionAnimation;
}
export type SourceCaptionProperty = keyof SourceCaptionSettings;
const CAPTIONS = ".story-caption";
const serialize = (doc: Document) => {
  assignCaptionNodeIds(doc);
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
};
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const numeric = (value: string | null, fallback = 0) =>
  value !== null && Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Match preview ID minting before history captures the saved source. */
export function assignCaptionNodeIds(doc: Document): void {
  const assigned = new Set(
    [...doc.querySelectorAll("[data-hf-id]")].map((node) => node.getAttribute("data-hf-id")!),
  );
  walkCompositionDescendants(doc.body, (node) => {
    if (!node.hasAttribute("data-hf-id") && !EXCLUDED_TAGS.has(node.tagName.toLowerCase()))
      node.setAttribute("data-hf-id", mintHfId(node, assigned));
  });
}

function clearClonedIdentity(clone: Element): void {
  for (const node of [clone, ...clone.querySelectorAll("[data-hf-id],[data-hf-authored-id]")]) {
    node.removeAttribute("data-hf-id");
    node.removeAttribute("data-hf-authored-id");
  }
}

function metadata(cue: Element): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(cue.getAttribute("data-caption-style") ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : {};
  } catch {
    return {};
  }
}

function cueRange(cue: Element) {
  const start = numeric(cue.getAttribute("data-start"));
  return { start, end: start + numeric(cue.getAttribute("data-duration")) };
}

function preserveAnimationRange(cue: Element) {
  const range = cueRange(cue);
  if (!cue.hasAttribute("data-caption-animation-start"))
    cue.setAttribute("data-caption-animation-start", String(range.start));
  if (!cue.hasAttribute("data-caption-animation-end"))
    cue.setAttribute("data-caption-animation-end", String(range.end));
}

function captionText(cue: Element): HTMLElement | null {
  return (
    cue.querySelector<HTMLElement>("[data-caption-text]") ?? cue.querySelector<HTMLElement>("span")
  );
}

function readSettings(doc: Document, cue: HTMLElement): SourceCaptionSettings {
  const meta = metadata(cue);
  const css = [...doc.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
  const scripts = [...doc.scripts].map((item) => item.textContent ?? "").join("");
  const preset =
    typeof meta.preset === "string"
      ? meta.preset
      : scripts.includes(`"#${cue.id} `) && scripts.includes("scale:.88")
        ? "phrase-pop"
        : scripts.includes(`"#${cue.id} `) && scripts.includes("opacity:0")
          ? "subtle-fade"
          : "classic";
  const size = Number.parseFloat(
    cue.style.fontSize || css.match(/font-size:([\d.]+)px/)?.[1] || "54",
  );
  const outline = Number.parseFloat(css.match(/-webkit-text-stroke:([\d.]+)px/)?.[1] || "0");
  const text = captionText(cue);
  const bg =
    text?.getAttribute("data-caption-original-background") ||
    text?.style.background ||
    css.match(/(?:caption-text)[^{]*\{[^}]*background:([^;}]*)/)?.[1] ||
    "transparent";
  const saved = cue.getAttribute("data-caption-settings");
  let patch: Partial<SourceCaptionSettings> = {};
  if (saved) {
    try {
      patch = JSON.parse(saved);
    } catch {
      /* Older cues have no settings. */
    }
  }
  return {
    outline: typeof meta.outline_enabled === "boolean" ? meta.outline_enabled : outline > 0,
    background:
      typeof meta.background_enabled === "boolean"
        ? meta.background_enabled
        : bg !== "transparent" && !bg.endsWith("00") && !bg.endsWith(", 0)"),
    activeWord:
      typeof meta.active_word_enabled === "boolean"
        ? meta.active_word_enabled
        : ["active-color", "active-background", "karaoke"].includes(preset) ||
          !!doc.querySelector('[class*="caption-active"],[class*="caption-karaoke"]'),
    animation: captionAnimation(meta.animation, preset),
    ...patch,
    size,
  };
}

export function readSourceCaptionSettings(
  html: string,
  targets?: SourceCutTarget[],
): SourceCaptionSettings | null {
  const doc = parse(html);
  const cue = [...doc.querySelectorAll<HTMLElement>(CAPTIONS)].find((item) => {
    const { start, end } = cueRange(item);
    return (
      !targets ||
      targets.some((target) => start < target.start + target.duration && end > target.start)
    );
  });
  return cue ? readSettings(doc, cue) : null;
}

function wordTiming(word: HTMLElement, cue: HTMLElement, script: string) {
  const canonical = word.getAttribute("data-canonical-word")?.match(/:([\d.]+):([\d.]+)$/);
  const { start, end } = cueRange(cue);
  const escaped = word.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tween = script.match(new RegExp(`"#${escaped}"[^;]*duration:([\\d.]+)[^;]*},([\\d.]+)\\)`));
  const from = numeric(
    word.getAttribute("data-caption-word-start"),
    canonical ? Number(canonical[1]) : tween ? Number(tween[2]) : start,
  );
  return {
    start: from,
    end: numeric(
      word.getAttribute("data-caption-word-end"),
      canonical ? Number(canonical[2]) : tween ? from + Number(tween[1]) : end,
    ),
  };
}

function prepareWords(doc: Document) {
  const script = [...doc.scripts].map((item) => item.textContent).join("\n");
  const css = [...doc.querySelectorAll("style")].map((item) => item.textContent).join("\n");
  for (const cue of doc.querySelectorAll<HTMLElement>(CAPTIONS)) {
    if (!cue.hasAttribute("data-caption-settings"))
      cue.setAttribute("data-caption-settings", JSON.stringify(readSettings(doc, cue)));
    const text = captionText(cue);
    text?.setAttribute("data-caption-text", "");
    for (const [i, word] of [...(text?.querySelectorAll<HTMLElement>("span") ?? [])].entries()) {
      if (!word.id) word.id = `${cue.id}-word-${i + 1}`;
      const timing = wordTiming(word, cue, script);
      word.setAttribute("data-caption-word-start", String(timing.start));
      word.setAttribute("data-caption-word-end", String(timing.end));
      if (!word.hasAttribute("data-caption-original-class"))
        word.setAttribute("data-caption-original-class", word.className);
      const activeBackground =
        metadata(cue).preset === "active-background" || /caption-active[^}]*background:/.test(css);
      if (activeBackground && /caption-active/.test(word.className)) {
        word.style.padding = "0 .14em";
        word.style.margin = "0 -.14em";
        word.style.borderRadius = ".12em";
      }
    }
  }
}

function updateAppearance(
  doc: Document,
  cue: HTMLElement,
  property: SourceCaptionProperty,
  value: SourceCaptionSettings[SourceCaptionProperty],
) {
  const settings = { ...readSettings(doc, cue), [property]: value };
  cue.setAttribute("data-caption-settings", JSON.stringify(settings));
  const text = captionText(cue);
  if (!text) return;
  text.style.display = "inline-block";
  if (property === "size") cue.style.fontSize = `${settings.size}px`;
  if (property === "outline") {
    const css = [...doc.querySelectorAll("style")].map((style) => style.textContent ?? "").join("");
    if (!cue.hasAttribute("data-caption-original-stroke"))
      cue.setAttribute(
        "data-caption-original-stroke",
        cue.style.getPropertyValue("-webkit-text-stroke") ||
          css.match(/-webkit-text-stroke:([^;}]*)/)?.[1] ||
          "2px #000000",
      );
    let stroke = settings.outline
      ? cue.getAttribute("data-caption-original-stroke") || ""
      : "0px transparent";
    if (settings.outline && !Number.parseFloat(stroke || "0")) stroke = "2px #000000";
    cue.style.setProperty("-webkit-text-stroke", stroke);
  }
  if (property === "background") {
    const css = [...doc.querySelectorAll("style")].map((style) => style.textContent ?? "").join("");
    if (!text.hasAttribute("data-caption-original-background"))
      text.setAttribute(
        "data-caption-original-background",
        text.style.background ||
          css.match(/(?:caption-text)[^{]*\{[^}]*background:([^;}]*)/)?.[1] ||
          "#000000d1",
      );
    const original = text.getAttribute("data-caption-original-background") || "#000000d1";
    const visible = /^#[\da-f]{6}00$/i.test(original)
      ? original.slice(0, 7) + "d1"
      : original === "transparent" || original.endsWith(", 0)")
        ? "#000000d1"
        : original;
    text.style.background = settings.background ? visible : "transparent";
  }
  if (property === "activeWord") {
    for (const word of text.querySelectorAll<HTMLElement>("span")) {
      const original = word.getAttribute("data-caption-original-class") || "";
      word.className = settings.activeWord
        ? original
        : original
            .split(/\s+/)
            .filter((name) => !/caption-(active|karaoke)$/.test(name))
            .join(" ");
      if (!settings.activeWord) {
        word.style.backgroundImage = "none";
        word.style.backgroundColor = "transparent";
        word.style.color = "inherit";
      } else {
        word.style.removeProperty("background-image");
        word.style.removeProperty("background-color");
        word.style.removeProperty("color");
        if (
          word.getAttribute("data-caption-active") === "true" &&
          !/caption-active/.test(word.className)
        ) {
          const meta = metadata(cue);
          const highlight =
            typeof meta.highlight_color === "string" && /^#[\da-f]{6}$/i.test(meta.highlight_color)
              ? meta.highlight_color
              : "#FFE066";
          if (meta.preset === "active-background") {
            word.style.backgroundColor = highlight;
            word.style.padding = "0 .14em";
            word.style.margin = "0 -.14em";
            word.style.borderRadius = ".12em";
          } else word.style.color = highlight;
        }
      }
    }
  }
}

function rebuildAnimations(doc: Document) {
  doc.querySelectorAll("script[data-caption-animations]").forEach((node) => node.remove());
  const cues = [...doc.querySelectorAll<HTMLElement>(CAPTIONS)];
  const ids = cues.map((cue) => cue.id);
  let timeline =
    doc.querySelector("[data-composition-id]")?.getAttribute("data-composition-id") || "main";
  for (const script of doc.scripts) {
    const contents = script.textContent ?? "";
    timeline = contents.match(/window\.__timelines\["([^"]+)"\]\s*=/)?.[1] || timeline;
    script.textContent = contents.replace(
      /window\.__timelines\[[^\]]+\]\.(?:fromTo|to|set)\("([^"\n]+)"[^;]*;/g,
      (statement, selector: string) =>
        ids.some((id) => selector.includes(`#${id}`)) ? "" : statement,
    );
  }
  let animation = "";
  for (const cue of cues) {
    const timing = cueRange(cue);
    const range = {
      start: numeric(cue.getAttribute("data-caption-animation-start"), timing.start),
      end: numeric(cue.getAttribute("data-caption-animation-end"), timing.end),
    };
    const words = [...(captionText(cue)?.querySelectorAll<HTMLElement>("span[id]") ?? [])];
    for (const word of words) word.style.display = "inline-block";
    const settings = readSettings(doc, cue);
    animation += captionAnimationScript(
      [
        {
          id: cue.id,
          ...range,
          words: words.map((word) => ({
            id: word.id,
            start: numeric(word.getAttribute("data-caption-word-start")),
            end: numeric(word.getAttribute("data-caption-word-end")),
          })),
        },
      ],
      settings.animation,
      timeline,
    );
    if (settings.activeWord)
      for (const word of words) {
        const start = numeric(word.getAttribute("data-caption-word-start"));
        const end = numeric(word.getAttribute("data-caption-word-end"));
        if (/caption-karaoke/.test(word.className))
          animation += `window.__timelines[${JSON.stringify(timeline)}].fromTo(${JSON.stringify(`#${word.id}`)},{backgroundSize:"0% 100%,100% 100%"},{backgroundSize:"100% 100%,100% 100%",duration:${end - start},ease:"none"},${start});`;
        else if (
          !words.some(
            (item) =>
              /caption-active/.test(item.className) ||
              item.getAttribute("data-caption-active") === "true",
          )
        ) {
          const meta = metadata(cue);
          const highlight =
            typeof meta.highlight_color === "string" && /^#[\da-f]{6}$/i.test(meta.highlight_color)
              ? meta.highlight_color
              : "#FFE066";
          const root = `window.__timelines[${JSON.stringify(timeline)}]`;
          animation += `${root}.set(${JSON.stringify(`#${word.id}`)},{color:${JSON.stringify(highlight)}},${start}).set(${JSON.stringify(`#${word.id}`)},{color:"inherit"},${end});`;
        }
      }
  }
  const script = doc.createElement("script");
  script.setAttribute("data-caption-animations", "");
  script.textContent = animation;
  doc.body.append(script);
}

/** Split only crossing root narration cues; no speech timestamps are invented. */
function splitRootCues(doc: Document, targets: SourceCutTarget[]): HTMLElement[] {
  const selected: HTMLElement[] = [];
  for (const cue of [...doc.querySelectorAll<HTMLElement>(CAPTIONS)]) {
    const { start, end } = cueRange(cue);
    preserveAnimationRange(cue);
    const boundaries = [
      start,
      end,
      ...targets.flatMap((target) => [target.start, target.start + target.duration]),
    ].filter((point) => point >= start && point <= end);
    const times = [...new Set(boundaries)].sort((a, b) => a - b);
    for (let i = 0; i < times.length - 1; i++) {
      const from = times[i]!,
        to = times[i + 1]!;
      if (to <= from) continue;
      const part = times.length === 2 ? cue : cue.cloneNode(true);
      if (!(part instanceof HTMLElement)) continue;
      if (part !== cue) {
        clearClonedIdentity(part);
        part.id = `${cue.id}-part-${i}`;
        for (const [j, word] of [...part.querySelectorAll("span[id]")].entries())
          word.id = `${part.id}-word-${j}`;
        part.setAttribute("data-start", String(from));
        part.setAttribute("data-duration", String(to - from));
        cue.before(part);
      }
      if (targets.some((target) => from < target.start + target.duration && to > target.start))
        selected.push(part);
    }
    if (times.length > 2) cue.remove();
  }
  return selected;
}

export function patchSourceCaptions(
  html: string,
  property: SourceCaptionProperty,
  value: SourceCaptionSettings[SourceCaptionProperty],
  targets?: SourceCutTarget[],
): string {
  const doc = parse(html);
  if (!doc.querySelector(CAPTIONS)) return html;
  if (
    property === "size" &&
    (typeof value !== "number" || !Number.isFinite(value) || value < 8 || value > 400)
  )
    throw new Error("Choose a subtitle size between 8 and 400.");
  prepareWords(doc);
  // Remove old caption tweens before splitting changes their selectors.
  rebuildAnimations(doc);
  const cues = targets
    ? splitRootCues(doc, targets)
    : [...doc.querySelectorAll<HTMLElement>(CAPTIONS)];
  if (!cues.length) return html;
  for (const cue of cues) updateAppearance(doc, cue, property, value);
  rebuildAnimations(doc);
  return serialize(doc);
}

/** Keep the selected authored ID, splitting only the parts outside its cut. */
export function isolateRootCaptionAtCut(
  html: string,
  cueId: string,
  target: SourceCutTarget,
): string {
  const doc = parse(html);
  const cue = doc.getElementById(cueId);
  if (!cue?.matches(CAPTIONS)) return html;
  const { start, end } = cueRange(cue);
  const from = Math.max(start, target.start),
    to = Math.min(end, target.start + target.duration);
  if (to <= from || (from === start && to === end)) return html;
  prepareWords(doc);
  rebuildAnimations(doc);
  preserveAnimationRange(cue);
  for (const [label, first, last] of [
    ["before", start, from],
    ["after", to, end],
  ] as const) {
    if (last <= first) continue;
    const clone = cue.cloneNode(true);
    if (!(clone instanceof HTMLElement)) continue;
    let index = 1;
    while (doc.getElementById(`${cueId}-${label}-${index}`)) index++;
    clone.id = `${cueId}-${label}-${index}`;
    clearClonedIdentity(clone);
    clone.setAttribute("data-caption-split-origin", cueId);
    clone.setAttribute("data-start", String(first));
    clone.setAttribute("data-duration", String(last - first));
    for (const [i, child] of [...clone.querySelectorAll("[id],[data-hf-id]")].entries()) {
      if (child.id) child.id = `${clone.id}-word-${i}`;
    }
    cue.before(clone);
  }
  cue.setAttribute("data-start", String(from));
  cue.setAttribute("data-duration", String(to - from));
  rebuildAnimations(doc);
  return serialize(doc);
}
