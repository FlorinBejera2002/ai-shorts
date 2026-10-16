import { STUDIO_ORIGINAL_BOX_WIDTH_ATTR } from "./manualEditsTypes";

const FONT_BASE = "data-hf-studio-resize-font-base";
const FONT_INLINE = "data-hf-studio-resize-font-inline";

export type TextResizeSnapshot = { fontSize: string; base: string | null; inline: string | null };

function textLayoutWidth(width: number, sourceWidth: number) {
  // Glyph shaping and nested em padding round independently to layout subpixels.
  // Preserve existing wraps without imposing white-space rules on the text.
  return Number.isInteger(sourceWidth) ? width : Math.max(1, width - 0.25);
}

/** offsetWidth rounds away the fractional pixels needed to keep text on its line. */
export function readPreciseLayoutWidth(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const width = Number.parseFloat(style?.width ?? "");
  if (!(width > 0) || !style) return element.offsetWidth;
  if (style.boxSizing === "border-box") return width;
  return (
    width +
    [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce(
      (total, value) => total + (Number.parseFloat(value) || 0),
      0,
    )
  );
}

export function captureTextResize(element: HTMLElement): TextResizeSnapshot {
  return {
    fontSize: element.style.fontSize,
    base: element.getAttribute(FONT_BASE),
    inline: element.getAttribute(FONT_INLINE),
  };
}

export function restoreTextResize(element: HTMLElement, snapshot: TextResizeSnapshot) {
  element.style.fontSize = snapshot.fontSize;
  for (const [name, value] of [
    [FONT_BASE, snapshot.base],
    [FONT_INLINE, snapshot.inline],
  ]) {
    if (value == null) element.removeAttribute(name!);
    else element.setAttribute(name!, value);
  }
}

/** Resizing text scales its glyphs as well as its layout box. Media stays untouched. */
export function applyTextResize(element: HTMLElement, width: number) {
  if (
    !element.textContent?.trim() ||
    element.matches("svg,video,audio,canvas,iframe") ||
    element.querySelector("img,svg,video,audio,canvas,iframe")
  )
    return;
  const sourceWidth = Number(element.getAttribute(STUDIO_ORIGINAL_BOX_WIDTH_ATTR));
  if (!(sourceWidth > 0)) return;
  let font = Number(element.getAttribute(FONT_BASE));
  if (!(font > 0)) {
    font = Number.parseFloat(
      element.ownerDocument.defaultView?.getComputedStyle(element).fontSize ?? "",
    );
    if (!(font > 0)) return;
    element.setAttribute(FONT_BASE, String(font));
    element.setAttribute(FONT_INLINE, element.style.fontSize);
  }
  const availableWidth = textLayoutWidth(width, sourceWidth);
  element.style.fontSize = `${Math.max(1, Math.floor(((font * availableWidth) / sourceWidth) * 100) / 100)}px`;
}

export function readTextResizeFont(element: HTMLElement): number | null {
  if (!element.hasAttribute(FONT_BASE)) return null;
  const font = Number.parseFloat(element.style.fontSize);
  return Number.isFinite(font) && font > 0 ? font : null;
}

/** Inspector font changes become the next gesture's baseline, never a moving draft's baseline. */
export function rebaseTextResize(element: HTMLElement, currentWidth: number) {
  const sourceWidth = Number(element.getAttribute(STUDIO_ORIGINAL_BOX_WIDTH_ATTR));
  const base = Number(element.getAttribute(FONT_BASE));
  const font = Number.parseFloat(
    element.ownerDocument.defaultView?.getComputedStyle(element).fontSize ?? "",
  );
  if (!(sourceWidth > 0 && currentWidth > 0 && base > 0 && font > 0)) return;
  const availableWidth = textLayoutWidth(currentWidth, sourceWidth);
  if (Math.abs(font - (base * availableWidth) / sourceWidth) < 0.02) return;
  element.setAttribute(FONT_BASE, String((font * sourceWidth) / availableWidth));
  element.setAttribute(FONT_INLINE, element.style.fontSize);
}

export function clearTextResize(element: HTMLElement) {
  if (!element.hasAttribute(FONT_BASE)) return;
  element.style.fontSize = element.getAttribute(FONT_INLINE) ?? "";
  element.removeAttribute(FONT_BASE);
  element.removeAttribute(FONT_INLINE);
}

export function textResizeAttributes() {
  return [FONT_BASE, FONT_INLINE];
}
