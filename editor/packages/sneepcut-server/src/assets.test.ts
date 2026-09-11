import { expect, test } from "bun:test";
import { localizeGsap } from "./assets";

test("preview and render HTML use bundled GSAP and eagerly load motion paths offline", () => {
  const html = localizeGsap(
    '<html><head><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script></head><body></body></html>',
  );
  expect(html).not.toContain('src="https://cdn.jsdelivr.net');
  expect(html).toContain("data-sneepcut-motion-path");
  expect(html.indexOf("data-sneepcut-motion-path")).toBeLessThan(html.indexOf("</head>"));
  expect(localizeGsap(html)).toBe(html);
});
