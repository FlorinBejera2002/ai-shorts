/** Runtime picture layers are derived from source hosts, never authored content.
 * Strip them from the few clipboard/fallback paths that serialize preview DOM.
 */
export function authoredElementHtml(element: Element | null | undefined): string | null {
  if (!element || element.closest("[data-hf-visual-transition]")) return null;
  const container = element.ownerDocument.createElement("div");
  container.appendChild(element.cloneNode(true));
  for (const derived of container.querySelectorAll("[data-hf-visual-transition]")) derived.remove();
  return container.innerHTML;
}
