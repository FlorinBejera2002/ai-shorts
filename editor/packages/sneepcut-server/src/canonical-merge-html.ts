import { parse } from "acorn";
import { parseHTML } from "linkedom";
import postcss from "postcss";
import { readClipTiming, writeClipTiming } from "@hyperframes/core/composition-contract";

export class CanonicalMergeConflict extends Error {
  constructor(
    public readonly path: string,
    reason: string,
  ) {
    super(
      `Studio changes could not be merged in ${path}: ${reason}. Your saved project is unchanged.`,
    );
    this.name = "CanonicalMergeConflict";
  }
}

export function conflict(path: string, reason: string): never {
  throw new CanonicalMergeConflict(path, reason);
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function manualValue<T>(base: T, current: T, generated: T): T {
  return current === base ? generated : current;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}
function cloneElement(element: Element, deep = true): Element {
  const clone = element.cloneNode(deep);
  if (!isElement(clone)) throw new Error("Could not clone an HTML element");
  return clone;
}

/** Compare authored content, ignoring only Studio's automatically minted identifiers. */
export function elementValue(element: Element): string {
  const attrs = [...element.attributes]
    .filter((attribute) => attribute.name !== "data-hf-id")
    .map((attribute) => [
      attribute.name,
      attribute.name === "style" ? styleValue(attribute.value) : attribute.value,
    ])
    .sort(([left], [right]) => left!.localeCompare(right!));
  return JSON.stringify([
    element.tagName,
    attrs,
    [...element.childNodes].flatMap((child) => {
      if (isElement(child)) return [elementValue(child)];
      const text = child.textContent ?? "";
      return text.trim() ? [text] : [];
    }),
  ]);
}

function declarations(source: string): Map<string, string> {
  const result = new Map<string, string>();
  postcss.parse(`x{${source}}`).walkDecls((declaration) => {
    result.set(declaration.prop, declaration.value + (declaration.important ? " !important" : ""));
  });
  return result;
}

function styleValue(source: string): string {
  return JSON.stringify(
    [...declarations(source)].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mergeDeclarations(base: string, current: string, generated: string): string {
  const b = declarations(base),
    c = declarations(current),
    n = declarations(generated);
  return [...new Set([...n.keys(), ...c.keys(), ...b.keys()])]
    .flatMap((key) => {
      const value = manualValue(b.get(key), c.get(key), n.get(key));
      return value === undefined ? [] : [`${key}:${value}`];
    })
    .join(";");
}

function astValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(astValue);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["start", "end", "loc", "raw"].includes(key))
      .map(([key, child]) => [key, astValue(child)]),
  );
}

interface Statement {
  key: string;
  source: string;
  normalized: string;
}
function statements(source: string, path: string): Statement[] {
  try {
    const counts = new Map<string, number>();
    return parse(source, { ecmaVersion: "latest", sourceType: "script" }).body.map((node) => {
      let identity: unknown = node.type;
      if (node.type === "ExpressionStatement") {
        const expression = node.expression;
        if (expression.type === "AssignmentExpression")
          identity = ["assign", astValue(expression.left)];
        else if (expression.type === "CallExpression") {
          // Calls on the same target are kept in authored order; parameter edits
          // therefore retain their identity when Studio changes timing or easing.
          let call = expression;
          while (
            call.callee.type === "MemberExpression" &&
            call.callee.object.type === "CallExpression"
          )
            call = call.callee.object;
          identity = ["call", astValue(call.callee), astValue(call.arguments[0])];
        } else identity = astValue(expression);
      } else if (node.type === "VariableDeclaration")
        identity = ["variable", node.declarations.map((declaration) => astValue(declaration.id))];
      else if (node.type === "FunctionDeclaration") identity = ["function", node.id?.name];
      const prefix = JSON.stringify(identity);
      const index = counts.get(prefix) ?? 0;
      counts.set(prefix, index + 1);
      return {
        key: `${prefix}:${index}`,
        source: source.slice(node.start, node.end),
        normalized: JSON.stringify(astValue(node)),
      };
    });
  } catch {
    return conflict(path, "an edited animation script is not valid JavaScript");
  }
}

export function mergeScript(
  base: string,
  current: string,
  generated: string,
  path: string,
  preserveTopology = false,
): string {
  if (!preserveTopology && current === base) return generated;
  if (generated === base) return current;
  const b = new Map(statements(base, path).map((statement) => [statement.key, statement]));
  const c = new Map(statements(current, path).map((statement) => [statement.key, statement]));
  const n = new Map(statements(generated, path).map((statement) => [statement.key, statement]));
  return [...new Set([...n.keys(), ...c.keys()])]
    .flatMap((key) => {
      const before = b.get(key),
        edited = c.get(key);
      const incoming = n.get(key);
      const sourceTiming =
        preserveTopology && (key.includes("source-scene-") || key.startsWith('["assign"'));
      const next = sourceTiming ? before : incoming;
      if (before && !edited) return [];
      if (!before && edited && next && edited.normalized !== next.normalized)
        return conflict(
          path,
          "a new animation has the same identity as a manually added animation",
        );
      if (edited && edited.normalized !== before?.normalized) return [edited.source];
      return next ? [next.source] : [];
    })
    .join("\n");
}

export function mergeCss(base: string, current: string, generated: string, path: string): string {
  const rules = (source: string) => {
    const counts = new Map<string, number>();
    return new Map(
      postcss.parse(source).nodes.map((node) => {
        const identity =
          node.type === "rule"
            ? node.selector
            : node.type === "atrule"
              ? `@${node.name} ${node.params}`
              : node.toString();
        const count = counts.get(identity) ?? 0;
        counts.set(identity, count + 1);
        return [`${identity}:${count}`, node] as const;
      }),
    );
  };
  const b = rules(base),
    c = rules(current),
    n = rules(generated);
  return [...new Set([...n.keys(), ...c.keys()])]
    .flatMap((key) => {
      const before = b.get(key),
        edited = c.get(key),
        next = n.get(key);
      if (before && !edited) return [];
      if (!before) return [(edited ?? next)?.toString() ?? ""];
      if (!edited || edited.toString() === before.toString()) return next ? [next.toString()] : [];
      if (!next) return [edited.toString()];
      if (before.type === "rule" && edited.type === "rule" && next.type === "rule") {
        const body = (rule: postcss.Rule) => rule.nodes.map((node) => node.toString()).join(";");
        return [`${next.selector}{${mergeDeclarations(body(before), body(edited), body(next))}}`];
      }
      if (
        before.type === "atrule" &&
        edited.type === "atrule" &&
        next.type === "atrule" &&
        before.nodes &&
        edited.nodes &&
        next.nodes
      ) {
        // Font-face contains declarations; media/keyframes contain nested rules.
        const declarationBlock = before.nodes.every((node) => node.type === "decl");
        const body = (rule: postcss.AtRule) =>
          (rule.nodes ?? []).map((node) => node.toString()).join(declarationBlock ? ";" : "\n");
        return [
          `@${next.name} ${next.params}{${declarationBlock ? mergeDeclarations(body(before), body(edited), body(next)) : mergeCss(body(before), body(edited), body(next), path)}}`,
        ];
      }
      return [edited.toString()];
    })
    .join("\n");
}

function childMap(element: Element): Map<string, Element> {
  const counts = new Map<string, number>();
  return new Map(
    [...element.children].map((child) => {
      // hf-id is minted on preview, whereas canonical ids exist before first open.
      const identity = child.id
        ? `#${child.id}`
        : `${child.tagName}:${child.getAttribute("src") ?? ""}`;
      const count = counts.get(identity) ?? 0;
      counts.set(identity, count + 1);
      return [`${identity}:${count}`, child];
    }),
  );
}

function sourceHost(element: Element): boolean {
  return element.hasAttribute("data-source-window") && element.hasAttribute("data-composition-src");
}

function precedingText(element: Element | undefined): string {
  let result = "";
  for (let node = element?.previousSibling; node && !isElement(node); node = node.previousSibling)
    if (node.nodeType === 3) result = (node.textContent ?? "") + result;
  return result;
}

function trailingText(element: Element): string {
  let result = "";
  for (let node = element.lastChild; node && !isElement(node); node = node.previousSibling)
    if (node.nodeType === 3) result = (node.textContent ?? "") + result;
  return result;
}

const WINDOW_ATTRIBUTES = [
  "data-start",
  "data-duration",
  "data-end",
  "data-playback-start",
  "data-playback-rate",
  "data-composition-src",
  "data-composition-id",
];
export function topology(element: Element): string {
  return JSON.stringify(
    [...element.querySelectorAll("[data-source-window][data-composition-src]")].map((host) => [
      host.id,
      ...WINDOW_ATTRIBUTES.map((name) => host.getAttribute(name)),
    ]),
  );
}

function mergeElement(
  base: Element,
  current: Element,
  generated: Element,
  path: string,
  preserveTopology: boolean,
): Element {
  const result = cloneElement(generated, false);
  const names = new Set(
    [...base.attributes, ...current.attributes, ...generated.attributes].map(
      (attribute) => attribute.name,
    ),
  );
  for (const name of names) {
    const value =
      name === "style"
        ? mergeDeclarations(
            base.getAttribute(name) ?? "",
            current.getAttribute(name) ?? "",
            generated.getAttribute(name) ?? "",
          )
        : manualValue(
            base.getAttribute(name),
            current.getAttribute(name),
            generated.getAttribute(name),
          );
    if (value === null) result.removeAttribute(name);
    else result.setAttribute(name, value);
  }
  if (preserveTopology && sourceHost(current)) {
    for (const name of WINDOW_ATTRIBUTES) {
      const value = current.getAttribute(name);
      if (value === null) result.removeAttribute(name);
      else result.setAttribute(name, value);
    }
  }
  if (preserveTopology && current.hasAttribute("data-composition-id") && !sourceHost(current)) {
    for (const name of ["data-duration", "data-end"])
      if (current.hasAttribute(name)) result.setAttribute(name, current.getAttribute(name)!);
  }
  const tag = current.tagName.toLowerCase();
  if (tag === "script" || tag === "style") {
    const b = base.textContent ?? "",
      c = current.textContent ?? "",
      n = generated.textContent ?? "";
    result.textContent =
      tag === "style" ? mergeCss(b, c, n, path) : mergeScript(b, c, n, path, preserveTopology);
    return result;
  }
  const b = childMap(base),
    c = childMap(current),
    n = childMap(generated);
  if (!b.size && !c.size && !n.size) {
    result.textContent = manualValue(base.textContent, current.textContent, generated.textContent);
    return result;
  }
  // Rich text replacement is one authored operation, including its whitespace.
  if ((!b.size && c.size) || (b.size && !c.size)) {
    result.innerHTML = current.innerHTML;
    return result;
  }
  const oldOrder = [...b.keys()].filter((key) => c.has(key));
  const currentOrder = [...c.keys()].filter((key) => b.has(key));
  const manuallyReordered = JSON.stringify(oldOrder) !== JSON.stringify(currentOrder);
  const order = [
    ...new Set(
      preserveTopology || manuallyReordered
        ? [...c.keys(), ...n.keys()]
        : [...n.keys(), ...c.keys()],
    ),
  ];
  for (const key of order) {
    const before = b.get(key),
      edited = c.get(key),
      next = n.get(key);
    if (before && !edited) continue;
    if (preserveTopology && next && sourceHost(next) && !edited) continue;
    let child: Element | undefined;
    if (before && edited && next)
      child = mergeElement(before, edited, next, path, preserveTopology);
    else if (
      edited &&
      (!before ||
        elementValue(edited) !== elementValue(before) ||
        (preserveTopology && sourceHost(edited)))
    )
      child = edited;
    else child = next;
    if (child) {
      const text = manualValue(precedingText(before), precedingText(edited), precedingText(next));
      if (text) result.appendChild(result.ownerDocument.createTextNode(text));
      result.appendChild(child.cloneNode(true));
    }
  }
  const tail = manualValue(trailingText(base), trailingText(current), trailingText(generated));
  if (tail) result.appendChild(result.ownerDocument.createTextNode(tail));
  return result;
}

export function mergeHtml(base: string, current: string, generated: string, path: string): string {
  const b = parseHTML(base).document,
    c = parseHTML(current).document,
    n = parseHTML(generated).document;
  const preserveTopology = topology(b.documentElement) !== topology(c.documentElement);
  const reapplyCaptions = preserveCaptionEdits(b, c, n, path);
  const merged = mergeElement(
    b.documentElement,
    c.documentElement,
    n.documentElement,
    path,
    preserveTopology,
  );
  reapplyCaptions(merged);
  return `<!doctype html>\n${merged.outerHTML}`;
}

/** A preset can change one phrase into many cues; word identity survives that regrouping. */
function preserveCaptionEdits(
  base: Document,
  current: Document,
  generated: Document,
  path: string,
): (result: Element) => void {
  if (
    !base.querySelector("[data-canonical-word]") ||
    !generated.querySelector("[data-canonical-word]")
  )
    return () => {};
  const shape = (document: Document) =>
    JSON.stringify(
      [...document.querySelectorAll(".story-caption")].map((cue) => [
        cue.id,
        ...[...cue.querySelectorAll("[data-canonical-word]")].map((word) =>
          word.getAttribute("data-canonical-word"),
        ),
      ]),
    );
  if (shape(base) === shape(generated)) return () => {};
  const changes: Array<{
    before: Element;
    edited: Element;
    keys: string[];
    kind: "word" | "cue" | "text" | "replacement";
  }> = [];
  const removed = new Set<string>();
  const words = (element: Element) =>
    [...element.querySelectorAll("[data-canonical-word]")].map(
      (word) => word.getAttribute("data-canonical-word")!,
    );
  for (const cue of base.querySelectorAll(".story-caption")) {
    const edited = current.getElementById(cue.id);
    const keys = words(cue);
    if (!edited) {
      for (const key of keys) removed.add(key);
      continue;
    }
    if (!edited.querySelector("[data-canonical-word]") && edited.textContent !== cue.textContent) {
      changes.push({ before: cue, edited: cloneElement(edited), keys, kind: "replacement" });
      edited.replaceWith(cue.cloneNode(true));
      continue;
    }
    changes.push({ before: cue, edited: cloneElement(edited), keys, kind: "cue" });
    const beforeText = cue.querySelector(".story-caption-text"),
      editedText = edited.querySelector(".story-caption-text");
    if (beforeText && editedText)
      changes.push({ before: beforeText, edited: cloneElement(editedText), keys, kind: "text" });
    for (const word of cue.querySelectorAll("[data-canonical-word]")) {
      const after = edited.querySelector(`[id="${word.id}"]`);
      if (after)
        changes.push({
          before: word,
          edited: cloneElement(after),
          keys: [word.getAttribute("data-canonical-word")!],
          kind: "word",
        });
      else removed.add(word.getAttribute("data-canonical-word")!);
    }
    edited.replaceWith(cue.cloneNode(true));
  }
  return (result) => {
    const generatedWords = [...result.querySelectorAll("[data-canonical-word]")];
    const newKeys = [
      ...new Set(generatedWords.map((word) => word.getAttribute("data-canonical-word")!)),
    ];
    const mappedKeys = new Map<string, string>();
    const range = (key: string) => key.match(/^(.*):([\d.]+):([\d.]+)$/);
    for (const key of new Set(changes.flatMap((change) => change.keys).concat([...removed]))) {
      if (newKeys.includes(key)) {
        mappedKeys.set(key, key);
        continue;
      }
      const old = range(key);
      if (!old) continue;
      const candidates = newKeys
        .flatMap((candidate) => {
          const next = range(candidate);
          if (!next || next[1] !== old[1]) return [];
          const overlap = Math.max(
            0,
            Math.min(Number(old[3]), Number(next[3])) - Math.max(Number(old[2]), Number(next[2])),
          );
          const union =
            Math.max(Number(old[3]), Number(next[3])) - Math.min(Number(old[2]), Number(next[2]));
          return overlap > 0 && union > 0 ? [{ key: candidate, score: overlap / union }] : [];
        })
        .sort((left, right) => right.score - left.score);
      if (
        candidates[0] &&
        candidates[0].score > 0.4 &&
        (!candidates[1] || candidates[0].score > candidates[1].score + 0.05)
      )
        mappedKeys.set(key, candidates[0].key);
    }
    const changedAttributes = (before: Element, edited: Element, target: Element, cue: boolean) => {
      for (const name of new Set(
        [...before.attributes, ...edited.attributes].map((attribute) => attribute.name),
      )) {
        if (["id", "data-hf-id", "data-canonical-word"].includes(name)) continue;
        if (cue && ["data-start", "data-duration", "data-end"].includes(name)) continue;
        const old = before.getAttribute(name),
          value = edited.getAttribute(name);
        if (old === value) continue;
        if (name === "style")
          target.setAttribute(
            name,
            mergeDeclarations(old ?? "", value ?? "", target.getAttribute(name) ?? ""),
          );
        else if (value === null) target.removeAttribute(name);
        else target.setAttribute(name, value);
      }
    };
    for (const change of changes) {
      const targets = new Set<Element>();
      const keys = change.keys.map((key) => mappedKeys.get(key));
      for (const word of generatedWords) {
        if (!keys.includes(word.getAttribute("data-canonical-word")!)) continue;
        const target =
          change.kind === "word"
            ? word
            : change.kind === "text"
              ? word.closest(".story-caption-text")
              : word.closest(".story-caption");
        if (target) targets.add(target);
      }
      if (!targets.size && elementValue(change.before) !== elementValue(change.edited))
        conflict(
          path,
          "a manually edited caption has no corresponding words in the new transcript",
        );
      for (const target of targets) {
        const cue = change.kind === "cue" || change.kind === "replacement";
        changedAttributes(change.before, change.edited, target, cue);
        if (cue) {
          const before = readClipTiming(change.before),
            edited = readClipTiming(change.edited),
            next = readClipTiming(target);
          if (before.start !== edited.start || before.duration !== edited.duration) {
            const oldStart = before.start ?? 0,
              newStart = edited.start ?? oldStart;
            const ratio =
              before.duration && edited.duration != null ? edited.duration / before.duration : 1;
            writeClipTiming(target, {
              start: newStart + ((next.start ?? 0) - oldStart) * ratio,
              duration: (next.duration ?? 0) * ratio,
            });
          }
        }
        if (change.kind === "replacement") target.innerHTML = change.edited.innerHTML;
        if (change.kind === "word" && change.before.innerHTML !== change.edited.innerHTML)
          target.innerHTML = change.edited.innerHTML;
      }
    }
    for (const word of generatedWords)
      if (
        [...removed].some((key) => mappedKeys.get(key) === word.getAttribute("data-canonical-word"))
      )
        word.remove();
    for (const cue of result.querySelectorAll(".story-caption"))
      if (!cue.textContent?.trim()) cue.remove();
  };
}

export function rewrite(source: string, replacements: ReadonlyMap<string, string>): string {
  const items = [...replacements]
    .filter(([from, to]) => from !== to)
    .sort(([left], [right]) => right.length - left.length);
  // One pass avoids cascading swaps when scenes exchange their indexed filenames.
  const pattern = items.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!pattern) return source;
  return source.replace(
    new RegExp(`(?:${pattern})(?![a-zA-Z0-9_])`, "g"),
    (match) => replacements.get(match) ?? match,
  );
}
