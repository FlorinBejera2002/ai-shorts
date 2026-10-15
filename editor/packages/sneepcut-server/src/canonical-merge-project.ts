import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { parseHTML } from "linkedom";
import { conflict, elementValue, rewrite } from "./canonical-merge-html";
import {
  mergeCanonicalFiles,
  readEffectiveComposition,
  hasPlatformBadge,
  withoutPlatformBadge,
  type EffectiveComposition,
} from "./canonical-merge-files";

async function inventory(directory: string, prefix = ""): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) return conflict(path, "project contains a symbolic link");
    if (entry.isDirectory())
      for (const item of await inventory(directory, path)) result.set(...item);
    else if (entry.isFile()) result.set(path, join(directory, path));
  }
  return result;
}

async function textFiles(entries: ReadonlyMap<string, string>): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const [path, absolute] of entries)
    if (/\.(html|json|css|js)$/.test(path) && !path.startsWith("vendor/"))
      result.set(path, await readFile(absolute, "utf8"));
  return result;
}

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export interface MergeCompositionProjectOptions {
  baseDir: string;
  currentDir: string;
  generatedDir: string;
  outputDir: string;
  baselineOutputDir: string;
}

/** All writes target fresh staging directories; the service owns CAS/commit. */
export async function mergeCompositionProject(
  options: MergeCompositionProjectOptions,
): Promise<EffectiveComposition> {
  const [base, current, generated] = await Promise.all([
    inventory(options.baseDir),
    inventory(options.currentDir),
    inventory(options.generatedDir),
  ]);
  const hashes = new Map<string, Promise<string>>();
  const hashFile = (path: string) => {
    let result = hashes.get(path);
    if (!result) {
      result = digest(path);
      hashes.set(path, result);
    }
    return result;
  };
  // Older snapshots use source-N filenames. Never replace their media bytes:
  // manually inserted layers can still reference those paths after a reorder.
  const mediaRewrites = new Map<string, string>();
  const occupied = new Set(
    [...base.keys(), ...current.keys(), ...generated.keys()].map((path) => path.toLowerCase()),
  );
  // Replacing bytes is an authored source change even when the HTML src stays
  // identical. Give it an explicit path in the staged copy so the HTML merge
  // carries that choice through source changes and subsequent regenerations.
  const manualMediaRewrites = new Map<string, string>();
  for (const [path, absolute] of [...current]) {
    const before = base.get(path);
    if (!path.startsWith("assets/") || !before) continue;
    const hash = await hashFile(absolute);
    if (hash === (await hashFile(before))) continue;
    let next = `assets/manual-${hash.slice(0, 24)}${extname(path)}`;
    let suffix = 1;
    while (occupied.has(next.toLowerCase())) {
      const existing = current.get(next) ?? base.get(next) ?? generated.get(next);
      if (existing && (await hashFile(existing)) === hash) break;
      next = `assets/manual-${hash.slice(0, 24)}-${suffix++}${extname(path)}`;
    }
    occupied.add(next.toLowerCase());
    manualMediaRewrites.set(path, next);
    current.set(next, absolute);
  }
  for (const [path, absolute] of [...generated]) {
    const edited = current.get(path);
    if (!path.startsWith("assets/") || !edited) continue;
    const hash = await hashFile(absolute);
    if (hash === (await hashFile(edited))) continue;
    let next = `assets/generated-${hash.slice(0, 24)}${extname(path)}`;
    let suffix = 1;
    while (occupied.has(next.toLowerCase())) {
      const existing = current.get(next) ?? base.get(next) ?? generated.get(next);
      if (existing && (await hashFile(existing)) === hash) break;
      next = `assets/generated-${hash.slice(0, 24)}-${suffix++}${extname(path)}`;
    }
    occupied.add(next.toLowerCase());
    mediaRewrites.set(path, next);
    generated.delete(path);
    generated.set(next, absolute);
  }
  const [baseText, currentText, generatedText] = await Promise.all([
    textFiles(base),
    textFiles(current),
    textFiles(generated),
  ]);
  for (const [path, source] of currentText)
    currentText.set(path, rewrite(source, manualMediaRewrites));
  for (const [path, source] of generatedText)
    generatedText.set(path, rewrite(source, mediaRewrites));
  const merged = mergeCanonicalFiles(baseText, currentText, generatedText);
  const write = async (directory: string, path: string, content: string) => {
    const destination = join(directory, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  };
  for (const [path, content] of merged.files) await write(options.outputDir, path, content);
  for (const [path, content] of merged.baseline)
    await write(options.baselineOutputDir, path, content);
  const copy = async (source: string, directory: string, path: string) => {
    const destination = join(directory, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  };
  for (const path of new Set([...generated.keys(), ...current.keys()])) {
    if (merged.files.has(path) || merged.baseline.has(path)) continue;
    const before = base.get(path),
      edited = current.get(path),
      next = generated.get(path);
    if (before && !edited) continue;
    const source =
      before && edited && next && (await hashFile(before)) === (await hashFile(edited))
        ? next
        : (edited ?? next);
    if (source) await copy(source, options.outputDir, path);
    const baselineSource = next ?? (before && source ? before : undefined);
    if (baselineSource) await copy(baselineSource, options.baselineOutputDir, path);
  }
  const manuallyEdited =
    manualMediaRewrites.size > 0 ||
    [...currentText].some(([path, content]) => {
      const original = baseText.get(path);
      if (path.endsWith(".html") && original)
        return (
          elementValue(parseHTML(original).document.documentElement) !==
          elementValue(parseHTML(content).document.documentElement)
        );
      return original !== content;
    }) ||
    [...baseText.keys()].some((path) => !currentText.has(path));
  return readEffectiveComposition(merged.files, manuallyEdited);
}

/** Clean exports remove only the generated platform badge, even inside trim wrappers. */
export async function removePlatformBadge(directory: string): Promise<void> {
  const files = await textFiles(await inventory(directory));
  const raw = files.get("composition-plan.json");
  const legacyBadge = raw ? hasPlatformBadge(raw) : false;
  for (const [path, html] of files) {
    if (!path.endsWith(".html")) continue;
    const clean = withoutPlatformBadge(html, legacyBadge);
    if (clean !== html) await writeFile(join(directory, path), clean);
  }
}
