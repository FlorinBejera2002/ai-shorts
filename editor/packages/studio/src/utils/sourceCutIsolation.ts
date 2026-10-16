import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { getTimelineElementSourceFile } from "../player/lib/timelineElementHelpers";
import { normalizeTimelineCompositionSource } from "../components/editor/domEditingDom";
import { sourceCutTargets } from "./sourceCutChanges";

export function sourceCutHost(element: HTMLElement): HTMLElement | null {
  const host = element.closest<HTMLElement>("[data-source-window][id]");
  return host &&
    /^source-scene-\d+\.html$/.test(
      host.getAttribute("data-composition-src") ?? host.getAttribute("data-composition-file") ?? "",
    )
    ? host
    : null;
}

export function sourceCutHostSelection(selection: DomEditSelection): DomEditSelection | null {
  const host = sourceCutHost(selection.element);
  return host ? { ...selection, id: host.id, element: host } : null;
}

export interface SourceCutIsolation {
  path: string;
  previousPath: string;
  host: HTMLElement;
  parentPath: string;
  parentBefore: string;
  parentAfter: string;
  content: string;
}

export function sourceCutParentPath(host: HTMLElement, activePath: string | null): string {
  return (
    normalizeTimelineCompositionSource(getTimelineElementSourceFile(host)) ||
    activePath ||
    "index.html"
  );
}

/** Plan copy-on-write before the mutation actor touches a shared scene file. */
export async function planSourceCutIsolation(
  selection: DomEditSelection,
  activePath: string | null,
  read: (path: string) => Promise<string>,
  exists: (path: string) => Promise<boolean>,
): Promise<SourceCutIsolation | null> {
  const host = sourceCutHost(selection.element);
  if (!host) {
    if (
      /^source-scene-\d+\.html$/.test(selection.sourceFile) &&
      activePath === selection.sourceFile
    ) {
      const targets = sourceCutTargets(await read("index.html")).filter(
        (item) => item.path === selection.sourceFile,
      );
      if (targets.length > 1)
        throw new Error("Select a cut in the main timeline before editing this shared source.");
    }
    return null;
  }
  if (host === selection.element) return null;
  const parentPath = sourceCutParentPath(host, activePath);
  const parentBefore = await read(parentPath);
  const targets = sourceCutTargets(parentBefore);
  const target = targets.find((item) => item.id === host.id);
  if (!target || targets.filter((item) => item.path === target.path).length < 2) return null;
  const used = new Set(targets.map((item) => item.path));
  let index = 1;
  while (used.has(`source-scene-${index}.html`) || (await exists(`source-scene-${index}.html`)))
    index++;
  const path = `source-scene-${index}.html`;
  // The compiler scopes authored IDs per host. Retaining the authored namespace
  // lets a live cut keep its CSS, timelines and selected node when its file forks.
  const content = await read(target.path);
  const doc = new DOMParser().parseFromString(parentBefore, "text/html");
  const parentHost = doc.getElementById(host.id)!;
  parentHost.setAttribute("data-composition-src", path);
  return {
    path,
    previousPath: target.path,
    host,
    parentPath,
    parentBefore,
    parentAfter: `<!doctype html>\n${doc.documentElement.outerHTML}`,
    content,
  };
}

/** Keep the live selected node and its sibling DOM identities: no iframe reload. */
export function applySourceCutIsolationToPreview(
  plan: SourceCutIsolation,
  selection: DomEditSelection,
): void {
  for (const element of [plan.host, ...plan.host.querySelectorAll("[data-composition-file]")]) {
    if (element.getAttribute("data-composition-file") === plan.previousPath)
      element.setAttribute("data-composition-file", plan.path);
  }
  if (plan.host.hasAttribute("data-composition-src"))
    plan.host.setAttribute("data-composition-src", plan.path);
  plan.host.setAttribute("data-composition-file", plan.path);
  // Selection snapshots can be reused by queued slider commits. Retarget them
  // alongside the live node before the next queued edit resolves its file.
  selection.sourceFile = plan.path;
}
