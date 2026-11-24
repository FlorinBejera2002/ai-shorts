import { FOOTAGE_ATTRIBUTE, footageToken, parseBrief } from './story-brief-tokens'

/**
 * Converts the editor's DOM back into brief text. Footage tags become @[asset:<id>] and line
 * breaks become newlines. A trailing line break that the browser adds at the end is not text.
 */
export function readBriefDOM(root: HTMLElement): string {
  let text = ''
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (!(node instanceof HTMLElement)) return
    const assetID = node.getAttribute(FOOTAGE_ATTRIBUTE)
    if (assetID) {
      text += footageToken(assetID)
      return
    }
    if (node.tagName === 'BR') {
      if (node.parentNode !== root || node !== root.lastChild) text += '\n'
      return
    }
    const isBlock = node.tagName === 'DIV' || node.tagName === 'P'
    if (isBlock && text && !text.endsWith('\n')) text += '\n'
    node.childNodes.forEach(visit)
  }
  root.childNodes.forEach(visit)
  return text
}

/**
 * Replaces the editor's content with the brief. Tags for footage that is no longer in the
 * project are left out, so the caller can detect and save the cleaned text.
 */
export function renderBriefDOM(
  root: HTMLElement,
  brief: string,
  createTag: (assetID: string) => HTMLElement | null
) {
  const nodes: Node[] = []
  for (const segment of parseBrief(brief)) {
    if (segment.type === 'footage') {
      const tag = createTag(segment.assetID)
      if (tag) nodes.push(tag)
      continue
    }
    segment.text.split('\n').forEach((line, index) => {
      if (index > 0) nodes.push(document.createElement('br'))
      if (line) nodes.push(document.createTextNode(line))
    })
  }
  root.replaceChildren(...nodes)
}
