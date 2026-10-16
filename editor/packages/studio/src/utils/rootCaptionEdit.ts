import { sanitizeRichTextChildren } from "@hyperframes/core/rich-text-sanitize";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import type { PatchOperation } from "./sourcePatcher";
import { assignCaptionNodeIds, isolateRootCaptionAtCut } from "./sourceCutCaptions";
import { sourceCutTargets } from "./sourceCutChanges";
import { sourceCutHost } from "./sourceCutIsolation";

export function rootCaptionElement(selection: DomEditSelection): HTMLElement | null {
  return sourceCutHost(selection.element)
    ? null
    : selection.element.closest<HTMLElement>(".story-caption[id]");
}

function selectedNode(doc: Document, selection: DomEditSelection): HTMLElement | null {
  const authored = selection.element.getAttribute("data-hf-authored-id");
  const byId = doc.getElementById(authored || selection.id || selection.element.id);
  if (byId) return byId;
  const byHf = selection.hfId
    ? [...doc.querySelectorAll<HTMLElement>("[data-hf-id]")].find(
        (node) => node.getAttribute("data-hf-id") === selection.hfId,
      )
    : null;
  return (
    byHf ||
    (selection.selector
      ? (doc.querySelectorAll<HTMLElement>(selection.selector)[selection.selectorIndex ?? 0] ??
        null)
      : null)
  );
}

function patchNode(node: HTMLElement, operations: PatchOperation[]) {
  for (const operation of operations) {
    const target = operation.childSelector
      ? node.querySelectorAll<HTMLElement>(operation.childSelector)[operation.childIndex ?? 0]
      : node;
    if (!target) throw new Error("This subtitle text is no longer available.");
    const { type, property, value } = operation;
    if (type === "inline-style") {
      if (value === null) target.style.removeProperty(property);
      else target.style.setProperty(property, value);
    } else if (type === "text-content" && value !== null) target.textContent = value;
    else if (type === "rich-text" && value !== null) {
      target.innerHTML = value;
      sanitizeRichTextChildren(target);
    } else if (type === "attribute" || type === "html-attribute") {
      if (/^on/i.test(property)) throw new Error("Event handlers are not subtitle settings.");
      if (value === null) target.removeAttribute(property);
      else target.setAttribute(property, value);
    }
  }
}

export interface RootCaptionEdit {
  after: string;
  cueId: string;
  split: boolean;
}

export function planRootCaptionEdit(
  html: string,
  selection: DomEditSelection,
  operations: PatchOperation[],
  time: number,
): RootCaptionEdit | null {
  const liveCue = rootCaptionElement(selection);
  if (!liveCue) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const selected = selectedNode(doc, selection);
  const cue = selected?.closest<HTMLElement>(".story-caption[id]");
  if (!cue) throw new Error("This subtitle is no longer available.");
  const start = Number(cue.getAttribute("data-start")) || 0;
  const end = start + (Number(cue.getAttribute("data-duration")) || 0);
  const targets = sourceCutTargets(html).filter(
    (target) => target.start < end && target.start + target.duration > start,
  );
  const target =
    targets.find((target) => time >= target.start && time < target.start + target.duration) ||
    targets[0];
  if (!target) return null;
  const isolated = isolateRootCaptionAtCut(html, cue.id, target);
  const result = new DOMParser().parseFromString(isolated, "text/html");
  const node = selectedNode(result, selection);
  if (!node) throw new Error("This subtitle is no longer available.");
  patchNode(node, operations);
  assignCaptionNodeIds(result);
  return {
    after: `<!doctype html>\n${result.documentElement.outerHTML}`,
    cueId: cue.id,
    split: isolated !== html,
  };
}

/** Preserve the selected DOM node while installing its saved neighbouring cues. */
export function syncRootCaptionEdit(
  selection: DomEditSelection,
  edit: RootCaptionEdit,
  sourceFile: string,
): void {
  const liveCue = rootCaptionElement(selection);
  if (!liveCue) throw new Error("The selected subtitle changed before saving.");
  const source = new DOMParser().parseFromString(edit.after, "text/html");
  const cue = source.getElementById(edit.cueId)!;
  liveCue.setAttribute("data-start", cue.getAttribute("data-start")!);
  liveCue.setAttribute("data-duration", cue.getAttribute("data-duration")!);
  for (const copy of source.querySelectorAll<HTMLElement>("[data-caption-split-origin]")) {
    if (
      copy.getAttribute("data-caption-split-origin") !== edit.cueId ||
      liveCue.ownerDocument.getElementById(copy.id)
    )
      continue;
    const node = liveCue.ownerDocument.importNode(copy, true);
    node.setAttribute("data-composition-file", sourceFile);
    liveCue.before(node);
  }
}
