export const COMPOSITION_ASPECTS = [
  { label: "9:16", width: 1080, height: 1920 },
  { label: "16:9", width: 1920, height: 1080 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "4:5", width: 1080, height: 1350 },
  { label: "2:3", width: 1080, height: 1620 },
] as const;

/** Change authored canvas dimensions so preview and export use the same ratio. */
export function changeCompositionAspect(source: string, label: string): string {
  const aspect = COMPOSITION_ASPECTS.find((item) => item.label === label);
  if (!aspect) throw new Error("Choose a supported aspect ratio.");
  const document = new DOMParser().parseFromString(source, "text/html");
  const root = document.querySelector<HTMLElement>(
    "[data-composition-id][data-width][data-height]",
  );
  if (!root) throw new Error("This composition has no editable canvas dimensions.");
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
