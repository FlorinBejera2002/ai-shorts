// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDomEditCommits } from "./useDomEditCommits";
import { useGsapAwareEditing } from "./useGsapAwareEditing";
import {
  makeSelection,
  mountReactHarness,
  installReactActEnvironment,
} from "./domSelectionTestHarness";
import { applyStudioBoxSizeDraft } from "../components/editor/manualEdits";
import { usePlayerStore } from "../player";
import type { RecordEditInput } from "../utils/studioFileHistory";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
installReactActEnvironment();

const original = `<!doctype html><html><body><main data-composition-id="main">
<div id="first" data-source-window data-composition-src="source-scene-1.html" data-start="0" data-duration="1"></div>
<div id="second" data-source-window data-composition-src="source-scene-2.html" data-start="1" data-duration="1"></div>
<div class="clip story-caption" id="caption" data-start="0" data-duration="2" style="font-size:40px;width:200px;height:60px" data-caption-style='{"preset":"classic"}'><span class="story-caption-text" data-caption-text><span id="word" data-caption-word-start="0" data-caption-word-end="2">Hello</span></span></div>
</main><script>window.__timelines["main"]=gsap.timeline({paused:true});window.__timelines["main"].to({},{duration:2},0);</script></body></html>`;
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function mountGesture() {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.body.innerHTML = parse(original).body.innerHTML;
  const element = doc.getElementById("caption")!;
  Object.defineProperty(element, "offsetWidth", { value: 200 });
  Object.defineProperty(element, "offsetHeight", { value: 60 });
  // A real generated caption is a GSAP visibility target even when its manual
  // geometry belongs to the current cut. Exercise the guard as well as routing.
  Reflect.set(iframe.contentWindow!, "__timelines", {
    main: { getChildren: () => [{ targets: () => [element] }] },
  });
  const selection = makeSelection("Caption", element);
  const storage = { html: original };
  const history: RecordEditInput[] = [];
  const write = vi.fn(async (_path: string, html: string, expected?: string) => {
    expect(storage.html).toBe(expected);
    storage.html = html;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.includes("/files/index.html")) throw new Error(`Unexpected request ${url}`);
      return new Response(JSON.stringify({ content: storage.html }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  const gsapCommitMutation = vi.fn(async () => undefined);
  const previewIframeRef = { current: iframe };
  const showToast = vi.fn();
  const reloadPreview = vi.fn();
  const rebind = vi.fn();
  Reflect.set(iframe.contentWindow!, "__hfForceTimelineRebind", rebind);
  let gestures!: ReturnType<typeof useGsapAwareEditing>;
  function Probe() {
    const commits = useDomEditCommits({
      activeCompPath: "index.html",
      previewIframeRef,
      showToast,
      queueDomEditSave: async (save) => save(),
      writeProjectFile: write,
      domEditSaveTimestampRef: { current: 0 },
      editHistory: {
        recordEdit: async (edit) => {
          history.push(edit);
        },
      },
      fileTree: ["index.html"],
      importedFontAssetsRef: { current: [] },
      projectId: "p1",
      projectIdRef: { current: "p1" },
      reloadPreview,
      domEditSelection: selection,
      applyDomSelection: vi.fn(),
      clearDomSelection: vi.fn(),
      refreshDomEditSelectionFromPreview: vi.fn(),
      buildDomSelectionFromTarget: vi.fn(async () => null),
    });
    gestures = useGsapAwareEditing({
      domEditSelection: selection,
      selectedGsapAnimations: [],
      gsapCommitMutation,
      previewIframeRef,
      showToast,
      bumpGsapCache: vi.fn(),
      makeFetchFallback: () => vi.fn(async () => []),
      trackGsapInteractionFailure: vi.fn(),
      handleDomBoxSizeCommit: commits.handleDomBoxSizeCommit,
      handleDomPathOffsetCommit: commits.handleDomPathOffsetCommit,
      handleDomRotationCommit: commits.handleDomRotationCommit,
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      setArcPath: vi.fn(),
      updateArcSegment: vi.fn(),
    });
    return null;
  }
  usePlayerStore.setState({ currentTime: 1.5 });
  const root = mountReactHarness(createElement(Probe));
  return {
    iframe,
    selection,
    element,
    storage,
    history,
    write,
    gsapCommitMutation,
    showToast,
    reloadPreview,
    rebind,
    gestures,
    cleanup: () => act(() => root.unmount()),
  };
}

describe("root narration through the Studio gesture actor", () => {
  it("persists pinch font + anchored position once for the current cut, with reversible history", async () => {
    const h = mountGesture();
    try {
      applyStudioBoxSizeDraft(h.element, { width: 300, height: 90 });
      await act(async () =>
        h.gestures.handleGsapAwareBoxSizeCommit(
          h.selection,
          { width: 300, height: 90 },
          { x: 12, y: 6 },
        ),
      );
      expect(h.gsapCommitMutation).not.toHaveBeenCalled();
      expect(h.showToast).not.toHaveBeenCalled();
      expect(h.reloadPreview).not.toHaveBeenCalled();
      expect(h.rebind).toHaveBeenCalledTimes(1);
      expect(h.write).toHaveBeenCalledTimes(1);
      expect(h.history).toHaveLength(1);
      const authoredIds = [...parse(h.storage.html).querySelectorAll("[data-hf-id]")].map((node) =>
        node.getAttribute("data-hf-id"),
      );
      const normalizedIds = [
        ...parse(ensureHfIds(h.storage.html)).querySelectorAll("[data-hf-id]"),
      ].map((node) => node.getAttribute("data-hf-id"));
      expect(normalizedIds).toEqual(authoredIds);
      expect(new Set(authoredIds).size).toBe(authoredIds.length);
      expect(h.iframe.contentDocument!.getElementById("caption")).toBe(h.element);
      const saved = parse(h.storage.html);
      expect(saved.querySelectorAll(".story-caption")).toHaveLength(2);
      const selected = saved.getElementById("caption")!;
      expect(selected.style.fontSize).toBe("60px");
      expect(selected.getAttribute("data-start")).toBe("1");
      expect(selected.getAttribute("data-duration")).toBe("1");
      expect(selected.style.getPropertyValue("--hf-studio-offset-x")).toBe("12px");
      const neighbour = saved.querySelector<HTMLElement>("[data-caption-split-origin]")!;
      expect(neighbour.style.fontSize).toBe("40px");
      expect(neighbour.hasAttribute("data-hf-studio-box-size")).toBe(false);
      expect(saved.getElementById("word")!.getAttribute("data-caption-word-start")).toBe("0");
      const edit = h.history[0].files["index.html"];
      expect(edit.before).toBe(original);
      await h.write("index.html", edit.before, edit.after);
      expect(parse(h.storage.html).querySelectorAll(".story-caption")).toHaveLength(1);
      await h.write("index.html", edit.after, edit.before);
      expect(parse(h.storage.html).getElementById("caption")!.style.fontSize).toBe("60px");
    } finally {
      h.cleanup();
    }
  });

  it("routes a drag through the same cut isolation even with GSAP visibility targeting", async () => {
    const h = mountGesture();
    try {
      await act(async () =>
        h.gestures.handleGsapAwarePathOffsetCommit(h.selection, { x: 20, y: 10 }),
      );
      expect(h.gsapCommitMutation).not.toHaveBeenCalled();
      expect(h.history).toHaveLength(1);
      const saved = parse(h.storage.html);
      expect(saved.getElementById("caption")!.getAttribute("data-start")).toBe("1");
      expect(saved.getElementById("caption")!.style.getPropertyValue("--hf-studio-offset-x")).toBe(
        "20px",
      );
      expect(
        saved
          .querySelector<HTMLElement>("[data-caption-split-origin]")!
          .style.getPropertyValue("--hf-studio-offset-x"),
      ).toBe("");
    } finally {
      h.cleanup();
    }
  });
});
