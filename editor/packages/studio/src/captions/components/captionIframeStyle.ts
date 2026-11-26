import type { CaptionModel, CaptionStyle } from "../types";

/** gsap API exposed on the preview iframe's window (when the composition loads it). */
interface IframeGsap {
  set: (el: HTMLElement, props: Record<string, unknown>) => void;
  getProperty: (el: HTMLElement, prop: string) => number;
}

const WRAPPER_ATTRIBUTE = "captionWrapper";

/** True when a style update touches any property that gsap moves through a wrapper. */
export function hasTransformUpdate(updates: Partial<CaptionStyle>): boolean {
  return (
    updates.x !== undefined ||
    updates.y !== undefined ||
    updates.scaleX !== undefined ||
    updates.scaleY !== undefined ||
    updates.rotation !== undefined
  );
}

/** The word element of one segment inside one rendered caption group, or null. */
function findWordElementInGroup(groupEl: HTMLElement, wordIndex: number): HTMLElement | null {
  let idx = 0;
  for (const child of groupEl.children) {
    const c = child as HTMLElement;
    if (c.dataset[WRAPPER_ATTRIBUTE] === "true") {
      const inner = c.querySelector<HTMLElement>(":scope > span");
      if (inner && idx === wordIndex) return inner;
    } else if (c.tagName === "SPAN" && idx === wordIndex) {
      return c;
    }
    idx++;
  }
  return null;
}

/** Word elements of the selected segments, located in the rendered caption groups. */
export function resolveSelectedWordElements(
  groupEls: NodeListOf<HTMLElement>,
  model: CaptionModel,
  selectedSegmentIds: Set<string>,
): HTMLElement[] {
  const targetEls: HTMLElement[] = [];
  for (const segId of selectedSegmentIds) {
    for (let gi = 0; gi < model.groupOrder.length; gi++) {
      const group = model.groups.get(model.groupOrder[gi]);
      if (!group) continue;
      const wordIndex = group.segmentIds.indexOf(segId);
      if (wordIndex < 0) continue;
      const groupEl = groupEls[gi];
      if (!groupEl) continue;
      const wordEl = findWordElementInGroup(groupEl, wordIndex);
      if (wordEl) targetEls.push(wordEl);
      break;
    }
  }
  return targetEls;
}

/** The caption wrapper around a word element, creating it when the word is not yet wrapped. */
function getOrCreateWrapper(doc: Document, el: HTMLElement): HTMLElement {
  const existing = el.parentElement;
  if (existing && existing.dataset[WRAPPER_ATTRIBUTE] === "true") return existing;
  const wrapper = doc.createElement("span");
  wrapper.style.display = "inline-block";
  wrapper.dataset[WRAPPER_ATTRIBUTE] = "true";
  el.parentNode?.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

/** Moves each target word's wrapper with gsap, merging the update over the current state. */
export function applyTransformToWrappers(
  iframe: HTMLIFrameElement,
  doc: Document,
  targetEls: HTMLElement[],
  updates: Partial<CaptionStyle>,
): void {
  try {
    const gsap = (iframe.contentWindow as unknown as { gsap?: IframeGsap } | null)?.gsap;
    if (!gsap) return;
    for (const el of targetEls) {
      const wrapper = getOrCreateWrapper(doc, el);
      gsap.set(wrapper, {
        x: updates.x ?? (gsap.getProperty(wrapper, "x") || 0),
        y: updates.y ?? (gsap.getProperty(wrapper, "y") || 0),
        scale: updates.scaleX ?? (gsap.getProperty(wrapper, "scale") || 1),
        rotation: updates.rotation ?? (gsap.getProperty(wrapper, "rotation") || 0),
      });
    }
  } catch {
    /* cross-origin */
  }
}
