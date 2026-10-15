export const COMPOSITION_ASPECTS = [
  { label: "9:16", width: 1080, height: 1920 },
  { label: "16:9", width: 1920, height: 1080 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "4:5", width: 1080, height: 1350 },
  { label: "2:3", width: 1080, height: 1620 },
] as const;

interface CanvasDimensions {
  width: number;
  height: number;
}

export function compositionCanvasDimensions(source: string): CanvasDimensions {
  const document = new DOMParser().parseFromString(source, "text/html");
  const root = document.querySelector("[data-composition-id][data-width][data-height]");
  const dimensions = {
    width: Number(root?.getAttribute("data-width")),
    height: Number(root?.getAttribute("data-height")),
  };
  if (!validDimensions(dimensions))
    throw new Error("This composition has invalid canvas dimensions.");
  return dimensions;
}

function validDimensions({ width, height }: CanvasDimensions): boolean {
  return [width, height].every((size) => Number.isInteger(size) && size > 0);
}

/** Change authored canvas dimensions so preview and export use the same ratio. */
export function changeCompositionAspect(
  source: string,
  label: string,
  originalCanvas?: CanvasDimensions,
): string {
  const preset = COMPOSITION_ASPECTS.find((item) => item.label === label);
  if (!preset && label !== "Original") throw new Error("Choose a supported aspect ratio.");
  const document = new DOMParser().parseFromString(source, "text/html");
  const root = document.querySelector<HTMLElement>(
    "[data-composition-id][data-width][data-height]",
  );
  if (!root) throw new Error("This composition has no editable canvas dimensions.");
  // Keep the initial authored canvas in the source so Original survives reload,
  // repeated changes and the same file-based Undo/Redo as the geometry itself.
  const original = {
    width: Number(root.getAttribute("data-original-width") ?? root.getAttribute("data-width")),
    height: Number(root.getAttribute("data-original-height") ?? root.getAttribute("data-height")),
  };
  if (!validDimensions(original)) {
    throw new Error("This composition has invalid original canvas dimensions.");
  }
  root.setAttribute("data-original-width", String(original.width));
  root.setAttribute("data-original-height", String(original.height));
  // Imported scenes must use their parent's target even if created later or
  // edited independently. Retain each file's own baseline for standalone edits.
  const aspect = preset ?? originalCanvas ?? original;
  if (!validDimensions(aspect)) throw new Error("This composition has invalid canvas dimensions.");
  root.setAttribute("data-width", String(aspect.width));
  root.setAttribute("data-height", String(aspect.height));
  root.style.width = `${aspect.width}px`;
  root.style.height = `${aspect.height}px`;
  for (const host of root.querySelectorAll<HTMLElement>("[data-composition-src]")) {
    if (!/^source-scene-\d+\.html$/.test(host.getAttribute("data-composition-src") ?? "")) continue;
    host.setAttribute("data-width", String(aspect.width));
    host.setAttribute("data-height", String(aspect.height));
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

/** Imported source scenes share the parent canvas and must resize with it. */
export function importedScenePaths(source: string): string[] {
  const document = new DOMParser().parseFromString(source, "text/html");
  return [
    ...new Set(
      [...document.querySelectorAll("[data-composition-src]")]
        .map((element) => element.getAttribute("data-composition-src") ?? "")
        .filter((path) => /^source-scene-\d+\.html$/.test(path)),
    ),
  ];
}
