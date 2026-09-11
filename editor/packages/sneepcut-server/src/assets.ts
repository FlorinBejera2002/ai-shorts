import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const studioRequire = createRequire(new URL("../../studio/package.json", import.meta.url));
const libraries = new Set(["gsap.min.js", "CustomEase.min.js", "MotionPathPlugin.min.js"]);

export function bundledGsap(filename: string): Buffer | null {
  if (!libraries.has(filename)) return null;
  return readFileSync(studioRequire.resolve(`gsap/dist/${filename}`));
}

export function localizeGsap(html: string): string {
  const localized = html
    .replace(
      /<script\b[^>]*\bsrc=["']https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[\d.]+\/dist\/([^"']+)["'][^>]*>\s*<\/script>/gi,
      (script, filename: string) => {
        const library = bundledGsap(filename);
        return library ? `<script>${library.toString("utf8")}</script>` : script;
      },
    )
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[\d.]+\/dist\//g, "/api/vendor/gsap/");
  if (localized.includes("data-sneepcut-motion-path")) return localized;
  const plugin = bundledGsap("MotionPathPlugin.min.js");
  const preload = `<script data-sneepcut-motion-path>${plugin?.toString("utf8") ?? ""}</script>`;
  return /<\/head>/i.test(localized)
    ? localized.replace(/<\/head>/i, () => `${preload}</head>`)
    : preload + localized;
}
