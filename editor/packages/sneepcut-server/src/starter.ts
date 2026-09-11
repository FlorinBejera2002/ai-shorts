import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundledGsap } from "./assets";

export function starterHtml(title: string): string {
  const escaped = title.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1920, height=1080"><title>${escaped}</title><script src="vendor/gsap.min.js"></script>
<style>body{margin:0;color:#fff;background:#101313;font-family:Arial,sans-serif}#main{position:relative;width:1920px;height:1080px;overflow:hidden;background:#101313}.clip{position:absolute;inset:0;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:140px}h1{font-size:112px;line-height:1.05;max-width:1500px;margin:32px 0;overflow-wrap:anywhere}p{font-size:32px;color:#c3c9c7;max-width:1300px;margin:0}.label{font-size:24px;letter-spacing:6px;color:#d9fc6e;text-transform:uppercase}</style></head>
<body><div id="main" data-composition-id="main" data-width="1920" data-height="1080" data-duration="6"><section id="title-card" class="clip" data-start="0" data-duration="6" data-track-index="0"><p class="label">SneepCut Studio</p><h1 id="headline">${escaped}</h1><p id="subtitle">Your story. Your edit.</p></section></div><script>const tl = gsap.timeline({paused:true});tl.fromTo("#headline",{y:48,opacity:0},{y:0,opacity:1,duration:0.6,ease:"power3.out"},0.2);window.__timelines["main"]=tl;</script></body></html>`;
}

export async function initializeProject(project: { dir: string; title: string }): Promise<void> {
  const gsap = bundledGsap("gsap.min.js");
  if (!gsap) throw new Error("Bundled animation library unavailable");
  await mkdir(join(project.dir, "vendor"), { recursive: true });
  await writeFile(join(project.dir, "vendor", "gsap.min.js"), gsap, { flag: "wx" });
  await writeFile(join(project.dir, "index.html"), starterHtml(project.title), { flag: "wx" });
}
