import { describe, expect, test } from "bun:test";
import { canonicalPreviewSources } from "./runtime";
import { parseHTML } from "linkedom";
import { rewriteAssetPaths } from "../../parsers/src/rewriteSubCompPaths";

describe("canonical preview transport", () => {
  test("uses an SDR browser proxy without changing persisted source or export identity", () => {
    const source =
      '<html><body><video id="camera" src="assets/original.mov" data-preview-src="assets/proxy.mp4"></video></body></html>';
    const preview = canonicalPreviewSources(source);
    const video = parseHTML(preview).document.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("assets/proxy.mp4");
    expect(video.getAttribute("data-render-src")).toBe("assets/original.mov");
    expect(source).toContain('src="assets/original.mov"');
  });
  test("rejects non-project preview destinations", () => {
    for (const path of [
      "https://example.test/file.mp4",
      "assets/../private.mp4",
      "/media/file.mp4",
    ])
      expect(() =>
        canonicalPreviewSources(
          `<video src="assets/original.mov" data-preview-src="${path}"></video>`,
        ),
      ).toThrow();
  });
  test("rebases both sources when the exact project is nested by a trim", () => {
    const { document } = parseHTML(
      '<video src="assets/original.mov" data-preview-src="assets/proxy.mp4"></video>',
    );
    rewriteAssetPaths(
      document.querySelectorAll("video"),
      "source/index.html",
      (element, name) => element.getAttribute(name),
      (element, name, value) => element.setAttribute(name, value),
      (path) => path.startsWith("source/assets/"),
    );
    const video = parseHTML(canonicalPreviewSources(document.toString())).document.querySelector(
      "video",
    )!;
    expect(video.getAttribute("src")).toBe("source/assets/proxy.mp4");
    expect(video.getAttribute("data-render-src")).toBe("source/assets/original.mov");
  });
});
