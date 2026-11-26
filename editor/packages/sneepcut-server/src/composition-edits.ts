import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseHTML } from "linkedom";
import postcss, { type ChildNode } from "postcss";
import { elementValue } from "./canonical-merge-html";
import { workspaceFileIncluded } from "./workspace";

function cssValue(node: ChildNode): unknown {
  switch (node.type) {
    case "decl":
      return [node.type, node.prop, node.value, !!node.important];
    case "rule":
      return [node.type, node.selector, node.nodes.map(cssValue)];
    case "atrule":
      return [node.type, node.name, node.params, node.nodes?.map(cssValue)];
    case "comment":
      return [node.type, node.text];
  }
}

function authoredHtml(source: string): string {
  const { document } = parseHTML(source);
  for (const style of document.querySelectorAll("style")) {
    try {
      // The merge serializer adds newlines between CSS rules. Preserve rule and
      // declaration order and every value, while ignoring that formatting.
      style.textContent = JSON.stringify(
        postcss.parse(style.textContent ?? "").nodes.map(cssValue),
      );
    } catch {
      // Unparseable CSS stays byte-sensitive rather than hiding an unknown edit.
    }
  }
  return elementValue(document.documentElement);
}

async function inventory(directory: string, prefix = ""): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    if (!workspaceFileIncluded(entry.name)) continue;
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error("Unsupported composition file");
    if (entry.isDirectory()) {
      for (const pair of await inventory(directory, path + "/")) files.set(...pair);
    } else if (entry.isFile()) files.set(path, join(directory, path));
    else throw new Error("Unsupported composition file");
  }
  return files;
}

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

/** Edit classification only; concurrency and publication still compare every source byte. */
export async function compositionHasManualChanges(
  baseline: string,
  current: string,
): Promise<boolean> {
  const [before, after] = await Promise.all([inventory(baseline), inventory(current)]);
  if (before.size !== after.size) return true;
  for (const [path, original] of before) {
    const edited = after.get(path);
    if (!edited) return true;
    if ((await digest(original)) === (await digest(edited))) continue;
    if (!path.endsWith(".html")) return true;
    const [left, right] = await Promise.all([readFile(original, "utf8"), readFile(edited, "utf8")]);
    if (authoredHtml(left) !== authoredHtml(right)) return true;
  }
  return false;
}
