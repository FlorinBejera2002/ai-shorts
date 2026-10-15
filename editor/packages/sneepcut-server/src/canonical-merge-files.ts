import { parseHTML } from "linkedom";
import { readClipTiming } from "@hyperframes/core/composition-contract";
import { removeElementFromHtml } from "@hyperframes/studio-server/source-mutation";
import { parseCanonicalComposition, type CanonicalScene } from "./canonical-composition";

import {
  conflict,
  record,
  elementValue,
  topology,
  mergeHtml,
  mergeCss,
  mergeScript,
  rewrite,
} from "./canonical-merge-html";
export { CanonicalMergeConflict } from "./canonical-merge-html";

type Files = ReadonlyMap<string, string>;

interface SceneIdentity {
  scene: CanonicalScene;
  path: string;
  root: string;
  host: string;
}
function sceneIdentities(files: Files): SceneIdentity[] {
  const raw = files.get("composition-plan.json");
  if (!raw) return [];
  const plan = parseCanonicalComposition(JSON.parse(raw));
  const scenes = new Map(
    plan.scenes.filter((scene) => scene.role !== "bridge").map((scene) => [scene.id, scene]),
  );
  const result: SceneIdentity[] = [];
  for (const [file, html] of files) {
    if (!file.endsWith(".html")) continue;
    for (const host of parseHTML(html).document.querySelectorAll(
      "[data-source-window][data-composition-src]",
    )) {
      const scene = scenes.get(
        host.getAttribute("data-canonical-scene") ?? host.id.replace(/^scene-/, ""),
      );
      if (!scene) continue;
      const path = host.getAttribute("data-composition-src")!;
      if (!result.some((identity) => identity.path === path))
        result.push({
          scene,
          path,
          root: host.getAttribute("data-composition-id")!,
          host: host.id,
        });
    }
  }
  return result;
}

function overlap(left: CanonicalScene, right: CanonicalScene): number {
  return Math.max(
    0,
    Math.min(left.source_in + left.duration, right.source_in + right.duration) -
      Math.max(left.source_in, right.source_in),
  );
}

function normalizeGenerated(base: Files, current: Files, generated: Files): Map<string, string> {
  const oldScenes = sceneIdentities(base),
    newScenes = sceneIdentities(generated);
  const used = new Set<SceneIdentity>();
  const occupied = new Set([...base.keys(), ...current.keys(), ...generated.keys()]);
  const replacements = new Map<string, string>();
  const sceneIds = new Map<string, string>();
  let nextIndex = 1;
  for (const next of newScenes) {
    const sameAsset = oldScenes.filter(
      (old) => !used.has(old) && old.scene.asset_id === next.scene.asset_id,
    );
    const positionalId = /^scene-\d+$/.test(next.scene.id);
    let previous = positionalId
      ? undefined
      : oldScenes.find((old) => !used.has(old) && old.scene.id === next.scene.id);
    // Generic recuts lack persistent block IDs. Require a uniquely best source
    // overlap, not index equality which can attach edits to different footage.
    if (!previous) {
      const candidates = sameAsset
        .filter((old) => overlap(old.scene, next.scene) > 0)
        .sort((left, right) => overlap(right.scene, next.scene) - overlap(left.scene, next.scene));
      if (
        candidates.length === 1 ||
        (candidates[0] &&
          overlap(candidates[0].scene, next.scene) >
            overlap(candidates[1]!.scene, next.scene) + 0.002)
      )
        previous = candidates[0];
    }
    let root: string;
    if (previous) {
      used.add(previous);
      root = previous.root;
      replacements.set(next.host, previous.host);
      sceneIds.set(next.scene.id, previous.scene.id);
      const oldHtml = base.get(previous.path),
        newHtml = generated.get(next.path);
      if (oldHtml && newHtml) {
        const oldAudio = parseHTML(oldHtml).document.querySelector('audio[id$="-audio"]');
        const newAudio = parseHTML(newHtml).document.querySelector('audio[id$="-audio"]');
        if (oldAudio?.id && newAudio?.id) replacements.set(newAudio.id, oldAudio.id);
      }
    } else {
      do {
        root = `source-scene-${nextIndex++}`;
      } while (occupied.has(`${root}.html`));
      occupied.add(`${root}.html`);
      if (oldScenes.some((old) => old.host === next.host)) {
        const id = `generated-${root}`;
        replacements.set(next.host, `scene-${id}`);
        sceneIds.set(next.scene.id, id);
      }
    }
    replacements.set(next.root, root);
    replacements.set(next.path, `${root}.html`);
  }
  const normalized = new Map<string, string>();
  for (const [path, source] of generated) {
    const content = path.endsWith(".html")
      ? rewrite(source, replacements).replace(
          /data-canonical-scene="([^"]+)"/g,
          (_attribute, id: string) => `data-canonical-scene="${sceneIds.get(id) ?? id}"`,
        )
      : source;
    normalized.set(replacements.get(path) ?? path, content);
  }
  // The saved plan is baseline provenance only, never a substitute for editable HTML.
  const raw = generated.get("composition-plan.json");
  if (raw) {
    const plan = parseCanonicalComposition(JSON.parse(raw));
    for (const scene of plan.scenes) {
      scene.id = sceneIds.get(scene.id) ?? scene.id;
      if (scene.parent_scene_id)
        scene.parent_scene_id = sceneIds.get(scene.parent_scene_id) ?? scene.parent_scene_id;
    }
    for (const audio of plan.audio)
      if (audio.scene_id) audio.scene_id = sceneIds.get(audio.scene_id) ?? audio.scene_id;
    normalized.set("composition-plan.json", JSON.stringify(plan));
  }
  return normalized;
}

function mergeJson(base: string, current: string, generated: string): string {
  const merge = (b: unknown, c: unknown, n: unknown): unknown => {
    if (JSON.stringify(b) === JSON.stringify(c)) return n;
    if (!record(b) || !record(c) || !record(n)) return c;
    return Object.fromEntries(
      [...new Set([...Object.keys(n), ...Object.keys(c)])].map((key) => [
        key,
        merge(b[key], c[key], n[key]),
      ]),
    );
  };
  return JSON.stringify(merge(JSON.parse(base), JSON.parse(current), JSON.parse(generated)));
}

export interface CanonicalMergeResult {
  files: Map<string, string>;
  baseline: Map<string, string>;
}

/** Rebase manual edits, including arbitrary authored layers, onto a new generation. */
export function mergeCanonicalFiles(
  base: Files,
  current: Files,
  generated: Files,
): CanonicalMergeResult {
  // A dashboard trim wraps the exact saved composition rather than rebuilding it.
  // Apply regeneration inside that wrapper so every subsequent trim stays intact.
  let innerPath = "index.html";
  const visited = new Set<string>();
  while (!visited.has(innerPath)) {
    visited.add(innerPath);
    const source = current.get(innerPath);
    if (!source) break;
    const hosts = [
      ...parseHTML(source).document.querySelectorAll("[data-source-window][data-composition-src]"),
    ];
    const child = hosts.length === 1 ? hosts[0]?.getAttribute("data-composition-src") : undefined;
    if (!child || !/^original-composition[^/]*\.html$/.test(child)) break;
    innerPath = child;
  }
  if (innerPath !== "index.html" && current.has(innerPath)) {
    const unwrapped = new Map(current);
    unwrapped.set("index.html", current.get(innerPath)!);
    // Remove the wrapper chain from the input to avoid treating it as a manual
    // insertion; all original wrapper bytes are restored after the inner merge.
    for (const path of visited) if (path !== "index.html") unwrapped.delete(path);
    const unwrappedBase = new Map(base);
    let basePath = "index.html";
    const baseVisited = new Set<string>();
    while (!baseVisited.has(basePath)) {
      baseVisited.add(basePath);
      const source = base.get(basePath);
      if (!source) break;
      const hosts = [
        ...parseHTML(source).document.querySelectorAll(
          "[data-source-window][data-composition-src]",
        ),
      ];
      const child = hosts.length === 1 ? hosts[0]?.getAttribute("data-composition-src") : undefined;
      if (!child || !/^original-composition[^/]*\.html$/.test(child)) break;
      basePath = child;
    }
    if (base.has(basePath)) unwrappedBase.set("index.html", base.get(basePath)!);
    for (const path of baseVisited) if (path !== "index.html") unwrappedBase.delete(path);
    const merged = mergeCanonicalFiles(unwrappedBase, unwrapped, generated);
    merged.files.set(innerPath, merged.files.get("index.html")!);
    for (const path of visited) if (path !== innerPath) merged.files.set(path, current.get(path)!);
    return merged;
  }
  const baseline = normalizeGenerated(base, current, generated);
  const retainedPaths = new Set(sceneIdentities(baseline).map((identity) => identity.path));
  const originalIndex = base.get("index.html"),
    currentIndex = current.get("index.html");
  const manualTopology =
    originalIndex &&
    currentIndex &&
    topology(parseHTML(originalIndex).document.documentElement) !==
      topology(parseHTML(currentIndex).document.documentElement);
  if (!manualTopology) {
    for (const original of sceneIdentities(base)) {
      if (retainedPaths.has(original.path)) continue;
      const before = base.get(original.path),
        edited = current.get(original.path);
      if (
        before &&
        edited &&
        elementValue(parseHTML(before).document.documentElement) !==
          elementValue(parseHTML(edited).document.documentElement)
      )
        conflict(
          original.path,
          "the new montage removes footage that has manual edits and no matching source interval remains",
        );
    }
  }
  const files = new Map<string, string>();
  for (const path of new Set([...baseline.keys(), ...current.keys()])) {
    const before = base.get(path),
      edited = current.get(path),
      next = baseline.get(path);
    if (path === "composition-plan.json") {
      if (next) files.set(path, next);
      continue;
    }
    if (before !== undefined && edited === undefined) continue;
    if (edited === before) {
      if (next !== undefined) files.set(path, next);
      continue;
    }
    if (edited === undefined) {
      if (next !== undefined) files.set(path, next);
      continue;
    }
    if (before === undefined || next === undefined) {
      files.set(path, edited);
      continue;
    }
    if (path.endsWith(".html")) files.set(path, mergeHtml(before, edited, next, path));
    else if (path.endsWith(".json")) files.set(path, mergeJson(before, edited, next));
    else if (path.endsWith(".css")) files.set(path, mergeCss(before, edited, next, path));
    else if (path.endsWith(".js")) files.set(path, mergeScript(before, edited, next, path));
    else files.set(path, edited);
  }
  // Copy-on-write child files created after a cut have their own root namespace.
  // Rebase the corresponding original child before applying that cut's local edits.
  for (const [path, html] of current) {
    if (!/^source-scene-\d+\.html$/.test(path) || base.has(path)) continue;
    const document = parseHTML(html).document;
    const video = document.querySelector("video.source-video");
    if (!video) continue;
    const canonicalScene = video.getAttribute("data-canonical-scene");
    const hosts = currentIndex
      ? [...parseHTML(currentIndex).document.querySelectorAll("[data-composition-src]")].filter(
          (host) => host.getAttribute("data-composition-src") === path,
        )
      : [];
    const lineage = sceneIdentities(base).filter((identity) =>
      hosts.some(
        (host) => host.id === identity.host || host.id.startsWith(`${identity.host}-split`),
      ),
    );
    const originals = [...base].filter(([oldPath, oldHtml]) => {
      if (!/^source-scene-\d+\.html$/.test(oldPath)) return false;
      if (lineage.length === 1) return oldPath === lineage[0]!.path;
      const old = parseHTML(oldHtml).document.querySelector("video.source-video");
      return canonicalScene
        ? old?.getAttribute("data-canonical-scene") === canonicalScene
        : old?.getAttribute("src") === video.getAttribute("src");
    });
    if (originals.length > 1)
      conflict(path, "a copied source scene has more than one possible original");
    const original = originals[0];
    if (!original) continue;
    const next = baseline.get(original[0]);
    if (!next) continue;
    const root = path.replace(/\.html$/, ""),
      oldRoot = original[0].replace(/\.html$/, "");
    const ids = new Map([[oldRoot, root]]);
    files.set(path, mergeHtml(rewrite(original[1], ids), html, rewrite(next, ids), path));
  }
  // Retain the generated ancestor of manually retained/duplicated source files so
  // subsequent generations can still distinguish authored changes from defaults.
  for (const [path, source] of base)
    if (!baseline.has(path) && files.has(path)) baseline.set(path, source);
  const previousPlan = base.get("composition-plan.json"),
    nextPlan = generated.get("composition-plan.json");
  if (previousPlan && nextPlan && hasPlatformBadge(previousPlan) && !hasPlatformBadge(nextPlan)) {
    for (const [path, html] of files)
      if (path.endsWith(".html")) files.set(path, withoutPlatformBadge(html, true));
  }
  const manifest = current.get(".hyperframes/studio-manual-edits.json");
  if (manifest) {
    const parsed: unknown = JSON.parse(manifest);
    if (record(parsed) && Array.isArray(parsed.edits))
      for (const edit of parsed.edits) {
        if (
          !record(edit) ||
          !record(edit.target) ||
          typeof edit.target.id !== "string" ||
          typeof edit.target.sourceFile !== "string"
        )
          continue;
        const before = current.get(edit.target.sourceFile),
          after = files.get(edit.target.sourceFile);
        if (
          before &&
          parseHTML(before).document.getElementById(edit.target.id) &&
          (!after || !parseHTML(after).document.getElementById(edit.target.id))
        )
          conflict(
            edit.target.sourceFile,
            "a legacy manual edit targets an element removed by regeneration",
          );
      }
  }
  return { files, baseline };
}

export interface EffectiveScene {
  id: string;
  canonical_scene_id: string;
  asset_id: string;
  start: number;
  duration: number;
  source_in: number;
  playback_rate: number;
}
export interface EffectiveComposition {
  width: number;
  height: number;
  duration: number;
  scenes: EffectiveScene[];
  manually_edited: boolean;
}

const numberAttribute = (element: Element, name: string, fallback = 0): number => {
  const value = Number(element.getAttribute(name) ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

export function readEffectiveComposition(
  files: Files,
  manuallyEdited = false,
): EffectiveComposition {
  const html = files.get("index.html");
  if (!html) return conflict("index.html", "missing composition");
  const root = parseHTML(html).document.querySelector(
    "[data-composition-id][data-width][data-height]",
  );
  if (!root) return conflict("index.html", "missing canvas dimensions");
  const result: EffectiveComposition = {
    width: numberAttribute(root, "data-width"),
    height: numberAttribute(root, "data-height"),
    duration: readClipTiming(root).duration ?? 0,
    scenes: [],
    manually_edited: manuallyEdited,
  };
  const identities = sceneIdentities(files);
  function visit(
    path: string,
    outputStart: number,
    sourceStart: number,
    duration: number,
    rate: number,
    chain: string[],
  ) {
    if (chain.includes(path) || chain.length > 24)
      return conflict(path, "cyclic source composition");
    const source = files.get(path);
    if (!source) return conflict(path, "a referenced source composition is missing");
    for (const host of parseHTML(source).document.querySelectorAll(
      "[data-source-window][data-composition-src]",
    )) {
      const timing = readClipTiming(host);
      const start = timing.start ?? 0,
        length = timing.duration ?? 0;
      const left = Math.max(start, sourceStart),
        right = Math.min(start + length, sourceStart + duration * rate);
      if (right <= left || host.hasAttribute("data-hidden")) continue;
      const childRate = numberAttribute(host, "data-playback-rate", 1);
      const childSource = numberAttribute(host, "data-playback-start") + (left - start) * childRate;
      const childPath = host.getAttribute("data-composition-src")!;
      const childStart = outputStart + (left - sourceStart) / rate;
      const childDuration = (right - left) / rate;
      const identity = identities.find((item) => item.path === childPath);
      const childHtml = files.get(childPath);
      const video = childHtml
        ? parseHTML(childHtml).document.querySelector("video.source-video")
        : null;
      const sceneId =
        host.getAttribute("data-canonical-scene") ??
        video?.getAttribute("data-canonical-scene") ??
        identity?.scene.id;
      const assetId =
        host.getAttribute("data-canonical-asset") ??
        video?.getAttribute("data-canonical-asset") ??
        identity?.scene.asset_id;
      if (sceneId && assetId)
        result.scenes.push({
          id: host.id,
          canonical_scene_id: sceneId,
          asset_id: assetId,
          start: childStart,
          duration: childDuration,
          source_in: childSource,
          playback_rate: rate * childRate,
        });
      else
        visit(childPath, childStart, childSource, childDuration, rate * childRate, [
          ...chain,
          path,
        ]);
    }
  }
  visit("index.html", 0, 0, result.duration, 1, []);
  return result;
}

export function hasPlatformBadge(plan: string): boolean {
  return Boolean(
    parseCanonicalComposition(JSON.parse(plan)).overlays?.some(
      (overlay) => overlay.id === "platform-badge",
    ),
  );
}

export function withoutPlatformBadge(html: string, legacyBadge: boolean): string {
  const document = parseHTML(html).document;
  const badge =
    document.querySelector('[data-canonical-overlay="platform-badge"]') ??
    (legacyBadge ? document.getElementById("overlay-platform-badge") : null);
  return badge?.id ? removeElementFromHtml(html, { id: badge.id }) : html;
}
