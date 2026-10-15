export interface SourceCutTarget {
  id: string;
  path: string;
  sourceStart: number;
  duration: number;
}

export type SourceCutPatch = (html: string, target: SourceCutTarget) => string;

const SOURCE_PATH = /^source-scene-\d+\.html$/;
const serialize = (document: Document) => `<!doctype html>\n${document.documentElement.outerHTML}`;

/** Only imported, authored scene hosts are eligible for cut-wide changes. */
export function sourceCutTargets(html: string): SourceCutTarget[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll("[data-source-window][data-composition-src][id]")]
    .filter((host) => SOURCE_PATH.test(host.getAttribute("data-composition-src") ?? ""))
    .map((host) => ({
      id: host.id,
      path: host.getAttribute("data-composition-src")!,
      sourceStart: Number(host.getAttribute("data-playback-start")) || 0,
      duration: readClipTiming(host).duration ?? 0,
    }));
}

export interface SourceCutChanges {
  files: Record<string, { before: string; after: string }>;
  /** Durable copies retained for undo/redo; undo restores the original host reference. */
  copies: Record<string, string>;
}

export function buildSourceCutChanges({
  parentPath,
  parentHtml,
  selectedId,
  sources,
  existingPaths,
  patch,
  applyToAll = false,
}: {
  parentPath: string;
  parentHtml: string;
  selectedId: string;
  sources: Record<string, string>;
  existingPaths: string[];
  patch: SourceCutPatch;
  applyToAll?: boolean;
}): SourceCutChanges {
  const all = sourceCutTargets(parentHtml);
  const selected = all.find((target) => target.id === selectedId);
  if (!selected) throw new Error("Select a source clip before changing its settings.");
  const targets = applyToAll ? all : [selected];
  const files: SourceCutChanges["files"] = {};
  const copies: SourceCutChanges["copies"] = {};
  const used = new Set([...existingPaths, ...all.map((target) => target.path)]);
  const document = new DOMParser().parseFromString(parentHtml, "text/html");
  let changedParent = false;
  for (const target of targets) {
    if (files[target.path]) continue;
    const source = sources[target.path];
    if (typeof source !== "string") throw new Error(`Could not read ${target.path}.`);
    if (patch(source, target) === source) continue;
    let path = target.path;
    let before = source;
    // Splitting a scene reuses its child file. Isolate a single-cut edit so its
    // sibling keeps its own image, audio and caption settings.
    if (!applyToAll && all.filter((item) => item.path === path).length > 1) {
      let number = 1;
      while (used.has(`source-scene-${number}.html`)) number++;
      path = `source-scene-${number}.html`;
      const oldId = target.path.replace(/\.html$/, "");
      const newId = path.replace(/\.html$/, "");
      before = source.replace(new RegExp(`${oldId}(?!\\d)`, "g"), newId);
      copies[path] = before;
      const host = document.getElementById(target.id)!;
      host.setAttribute("data-composition-src", path);
      host.setAttribute("data-composition-id", newId);
      changedParent = true;
      used.add(path);
    }
    const after = patch(before, { ...target, path });
    if (after !== before) files[path] = { before, after };
  }
  if (changedParent) files[parentPath] = { before: parentHtml, after: serialize(document) };
  return { files, copies };
}
import { readClipTiming } from "@hyperframes/core/composition-contract";
