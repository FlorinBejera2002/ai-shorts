export interface SourceCutTarget {
  id: string;
  path: string;
  start: number;
  sourceStart: number;
  duration: number;
  playbackRate?: number;
}

export type SourceCutPatch = (
  html: string,
  target: SourceCutTarget,
  selectedSource?: string,
) => string;

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
      start: readClipTiming(host).start ?? 0,
      sourceStart: Number(host.getAttribute("data-playback-start")) || 0,
      duration: readClipTiming(host).duration ?? 0,
      playbackRate: Number(host.getAttribute("data-playback-rate")) || 1,
    }));
}

export interface SourceCutChanges {
  files: Record<string, { before: string; after: string }>;
  /** Durable copies retained for undo/redo; undo restores the original host reference. */
  copies: Record<string, string>;
}

/** Undo retains child files; a cached project listing may not contain those copies yet. */
export async function prepareSourceCutChanges(
  input: Parameters<typeof buildSourceCutChanges>[0],
  exists: (path: string) => Promise<boolean>,
  attemptsRemaining = 256,
): Promise<SourceCutChanges> {
  const changes = buildSourceCutChanges(input);
  const candidates = Object.keys(changes.copies);
  const existing = await Promise.all(
    candidates.map(async (path) => ((await exists(path)) ? path : null)),
  );
  const collisions = existing.filter((path): path is string => path !== null);
  if (!collisions.length) return changes;
  if (attemptsRemaining <= 0) throw new Error("Clip files keep changing. Try again.");
  return prepareSourceCutChanges(
    {
      ...input,
      existingPaths: [...input.existingPaths, ...collisions],
    },
    exists,
    attemptsRemaining - 1,
  );
}

export function buildSourceCutChanges({
  parentPath,
  parentHtml,
  selectedId,
  sources,
  existingPaths,
  patch,
  applyToAll = false,
  patchParent,
  preserveNamespace = false,
}: {
  parentPath: string;
  parentHtml: string;
  selectedId: string;
  sources: Record<string, string>;
  existingPaths: string[];
  patch: SourceCutPatch;
  applyToAll?: boolean;
  patchParent?: (html: string, targets: SourceCutTarget[]) => string;
  preserveNamespace?: boolean;
}): SourceCutChanges {
  const all = sourceCutTargets(parentHtml);
  const selected = all.find((target) => target.id === selectedId);
  if (!selected) throw new Error("Select a source clip before changing its settings.");
  const targets = applyToAll ? all : [selected];
  const selectedSource = sources[selected.path];
  const files: SourceCutChanges["files"] = {};
  const copies: SourceCutChanges["copies"] = {};
  const used = new Set([...existingPaths, ...all.map((target) => target.path)]);
  const document = new DOMParser().parseFromString(parentHtml, "text/html");
  let changedParent = false;
  const applied = new Map<string, string>();
  for (const target of targets) {
    const source = sources[target.path];
    if (typeof source !== "string") throw new Error(`Could not read ${target.path}.`);
    const patched = patch(source, target, selectedSource);
    if (patched === source) continue;
    if (applied.get(target.path) === patched) continue;
    let path = target.path;
    let before = source;
    // Splitting a scene reuses its child file. Isolate a single-cut edit so its
    // sibling keeps its own image, audio and caption settings.
    const shared = all.filter((item) => item.path === path);
    const needsCopy =
      shared.length > 1 &&
      (!applyToAll || shared.some((item) => patch(source, item, selectedSource) !== patched));
    if (needsCopy) {
      let number = 1;
      while (used.has(`source-scene-${number}.html`)) number++;
      path = `source-scene-${number}.html`;
      const oldId =
        new DOMParser()
          .parseFromString(source, "text/html")
          .querySelector("[data-composition-id]")
          ?.getAttribute("data-composition-id") || target.path.replace(/\.html$/, "");
      const newId = path.replace(/\.html$/, "");
      before = preserveNamespace
        ? source
        : source.replace(new RegExp(`${oldId}(?!\\d)`, "g"), newId);
      copies[path] = before;
      const host = document.getElementById(target.id)!;
      host.setAttribute("data-composition-src", path);
      if (!preserveNamespace) host.setAttribute("data-composition-id", newId);
      changedParent = true;
      used.add(path);
    }
    const after = patch(before, { ...target, path }, selectedSource);
    if (after !== before) files[path] = { before, after };
    if (!needsCopy) applied.set(target.path, patched);
  }
  let afterParent = changedParent ? serialize(document) : parentHtml;
  if (patchParent) afterParent = patchParent(afterParent, targets);
  if (afterParent !== parentHtml) files[parentPath] = { before: parentHtml, after: afterParent };
  return { files, copies };
}
import { readClipTiming } from "@hyperframes/core/composition-contract";
