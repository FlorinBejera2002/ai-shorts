// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { syncSourceCutPreview } from "./sourceCutPreview";

const mocks = vi.hoisted(() => ({ sync: vi.fn(), reseek: vi.fn() }));
vi.mock("./sourceCutGsapPreview", () => ({ syncSourceCutGsapPreview: mocks.sync }));
vi.mock("../hooks/timelineTrackVisibility", () => ({ reseekPreviewRuntime: mocks.reseek }));
vi.mock("../player", () => ({ usePlayerStore: { getState: () => ({ currentTime: 3 }) } }));

it("rebuilds every affected cut after attribute changes and finalizes the shared preview once", () => {
  const parent =
    '<main><div id="first" data-source-window data-composition-src="source-scene-1.html" data-start="0" data-duration="2"></div><div id="second" data-source-window data-composition-src="source-scene-1.html" data-start="2" data-duration="2"></div></main>';
  const before =
    '<div data-composition-id="source-scene-1"><video id="video" style="opacity:1"></video></div><script>const tl=gsap.timeline();window.__timelines["source-scene-1"]=tl;</script>';
  const after = before
    .replace("opacity:1", "opacity:0.5")
    .replace("const tl", 'gsap.set("#video",{x:24});const tl');
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML =
    '<div id="first"><video data-hf-authored-id="video" style="opacity:1"></video></div><div id="second"><video data-hf-authored-id="video" style="opacity:1"></video></div>';
  const iframe = { contentDocument: doc } as HTMLIFrameElement;
  const original = doc.getElementById("first");
  const onAsyncFailure = vi.fn();
  mocks.sync.mockReset().mockImplementation((_iframe, host) => {
    expect(host.querySelector("video").style.opacity).toBe("0.5");
    expect(mocks.reseek).not.toHaveBeenCalled();
    return "applied";
  });
  mocks.reseek.mockReset();
  expect(
    syncSourceCutPreview(
      iframe,
      "index.html",
      parent,
      {
        copies: {},
        files: { "source-scene-1.html": { before, after } },
      },
      onAsyncFailure,
    ),
  ).toBe(true);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  expect(mocks.sync.mock.calls.map((args) => args[1].id)).toEqual(["first", "second"]);
  for (const args of mocks.sync.mock.calls)
    expect(args.slice(4)).toEqual([3, onAsyncFailure, true]);
  expect(mocks.reseek).toHaveBeenCalledExactlyOnceWith(iframe);
  expect(doc.getElementById("first")).toBe(original);
});
