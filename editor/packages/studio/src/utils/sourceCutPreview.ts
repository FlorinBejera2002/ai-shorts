import { diffSoftReloadableRestore } from "./gsapUndoRestore";
import { sourceCutTargets, type SourceCutChanges } from "./sourceCutChanges";
import { reseekPreviewRuntime } from "../hooks/timelineTrackVisibility";
import { queueSourceCutTimingUpdate } from "./sourceCutTiming";
import { extractGsapScriptText } from "./gsapSoftReload";
import { syncSourceCutGsapPreview } from "./sourceCutGsapPreview";
import { usePlayerStore } from "../player";

function findAuthoredElement(root: ParentNode, key: string): Element | undefined {
  const [type, ...rest] = key.split(":");
  const id = rest.join(":");
  return [...root.querySelectorAll("[id],[data-hf-id],[data-hf-authored-id]")].find((element) =>
    type === "hf"
      ? element.getAttribute("data-hf-id") === id
      : element.getAttribute("data-hf-authored-id") === id || element.id === id,
  );
}

function applyAttributeDelta(live: Element, before: Element, after: Element) {
  for (const name of new Set([...before.getAttributeNames(), ...after.getAttributeNames()])) {
    if (before.getAttribute(name) === after.getAttribute(name)) continue;
    if (name === "style" && "style" in live && "style" in before && "style" in after) {
      const oldStyle = (before as HTMLElement).style;
      const nextStyle = (after as HTMLElement).style;
      for (const property of new Set([...Array.from(oldStyle), ...Array.from(nextStyle)])) {
        if (
          oldStyle.getPropertyValue(property) === nextStyle.getPropertyValue(property) &&
          oldStyle.getPropertyPriority(property) === nextStyle.getPropertyPriority(property)
        )
          continue;
        (live as HTMLElement).style.setProperty(
          property,
          nextStyle.getPropertyValue(property),
          nextStyle.getPropertyPriority(property),
        );
      }
    } else if (after.hasAttribute(name)) live.setAttribute(name, after.getAttribute(name)!);
    else live.removeAttribute(name);
  }
}

/** Apply cut attributes and scoped timeline changes without replacing the mounted preview. */
export function syncSourceCutPreview(
  iframe: HTMLIFrameElement | null,
  parentPath: string,
  parentBefore: string,
  changes: SourceCutChanges,
  onAsyncFailure: () => void = () => {},
): boolean {
  const doc = iframe?.contentDocument;
  if (!doc) return false;
  const parentAfter = changes.files[parentPath]?.after ?? parentBefore;
  const originalTargets = sourceCutTargets(parentBefore);
  const targets = sourceCutTargets(parentAfter);
  const patches: Array<{ live: Element; before: Element; after: Element }> = [];
  const hosts: Array<{ live: Element; path: string; previousPath?: string }> = [];
  const scripts: Array<{ host: HTMLElement; text: string; html: string }> = [];
  // A parent caption/script change is not a source-host reference-only edit.
  if (changes.files[parentPath]) {
    const before = new DOMParser().parseFromString(parentBefore, "text/html");
    const after = new DOMParser().parseFromString(parentAfter, "text/html");
    for (const target of targets)
      before.getElementById(target.id)?.setAttribute("data-composition-src", target.path);
    if (before.documentElement.outerHTML !== after.documentElement.outerHTML) return false;
  }
  for (const target of targets) {
    const edit = changes.files[target.path];
    if (!edit) continue;
    const liveHost = doc.getElementById(target.id);
    const diff = diffSoftReloadableRestore(edit.before, edit.after);
    if (!liveHost || !diff) return false;
    const before = new DOMParser().parseFromString(edit.before, "text/html");
    const after = new DOMParser().parseFromString(edit.after, "text/html");
    if (
      [...before.querySelectorAll("script")].map((s) => s.textContent).join("\n") !==
      [...after.querySelectorAll("script")].map((s) => s.textContent).join("\n")
    ) {
      const text = extractGsapScriptText(edit.after);
      if (!text) return false;
      scripts.push({ host: liveHost, text, html: edit.after });
    }
    for (const key of diff.changedElementKeys) {
      const live = findAuthoredElement(liveHost, key);
      const oldElement = findAuthoredElement(before, key);
      const nextElement = findAuthoredElement(after, key);
      if (!live || !oldElement || !nextElement) return false;
      patches.push({ live, before: oldElement, after: nextElement });
    }
    const previousPath = originalTargets.find((item) => item.id === target.id)?.path;
    if (previousPath !== target.path)
      hosts.push({ live: liveHost, path: target.path, previousPath });
  }
  for (const patch of patches) {
    applyAttributeDelta(patch.live, patch.before, patch.after);
    queueSourceCutTimingUpdate(patch.live, patch.after);
  }
  for (const host of hosts) {
    for (const child of host.live.querySelectorAll("[data-composition-file]")) {
      if (child.getAttribute("data-composition-file") === host.previousPath)
        child.setAttribute("data-composition-file", host.path);
    }
    host.live.setAttribute("data-composition-file", host.path);
    if (host.live.hasAttribute("data-composition-src"))
      host.live.setAttribute("data-composition-src", host.path);
  }
  for (const script of scripts) {
    if (
      syncSourceCutGsapPreview(
        iframe,
        script.host,
        script.text,
        script.html,
        usePlayerStore.getState().currentTime,
        onAsyncFailure,
        true,
      ) === "cannot-soft-reload"
    )
      return false;
  }
  reseekPreviewRuntime(iframe);
  return true;
}
