// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { wrapScopedCompositionScript } from "@hyperframes/core/compiler/composition-scoping";
import { syncSourceCutGsapPreview } from "./sourceCutGsapPreview";

describe("source cut GSAP preview", () => {
  it("rebuilds successive edits in one compiled instance without clearing its sibling", () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><div data-composition-id="left"><video style="transform:translateX(12px)"></video></div><div data-composition-id="right"><video style="transform:translateX(24px)"></video></div></body></html>',
      "text/html",
    );
    const left = doc.querySelector<HTMLElement>('[data-composition-id="left"]')!;
    const right = doc.querySelector<HTMLElement>('[data-composition-id="right"]')!;
    const selected = right.querySelector<HTMLElement>("video")!;
    const sibling = left.querySelector<HTMLElement>("video")!;
    Object.assign(selected, { _gsap: {} });
    Object.assign(sibling, { _gsap: {} });
    const source =
      'const tl = gsap.timeline(); tl.to("video", {x:24}); window.__timelines["source"]=tl;';
    for (const id of ["left", "right"]) {
      const script = doc.createElement("script");
      script.textContent = wrapScopedCompositionScript(
        source,
        "source",
        undefined,
        `[data-composition-id="${id}"]`,
        id,
        "source",
      );
      doc.body.appendChild(script);
    }
    const siblingScript = doc.querySelector("script");
    const leftTimeline = { kill: vi.fn() };
    const rightTimeline = { kill: vi.fn() };
    const timelines = { left: leftTimeline, right: rightTimeline };
    const set = vi.fn();
    const iframe = {
      contentDocument: doc,
      contentWindow: {
        gsap: { set },
        __timelines: timelines,
        __player: { seek: vi.fn() },
        __hfForceTimelineRebind: () => {
          timelines.right = rightTimeline;
        },
      },
    } as unknown as HTMLIFrameElement;
    const reload = vi.fn();
    const authored =
      '<html><body><div id="source" data-composition-id="source"><video></video></div></body></html>';

    for (const x of [30, 45]) {
      expect(
        syncSourceCutGsapPreview(
          iframe,
          right,
          source.replace("x:24", `x:${x}`),
          authored,
          2.5,
          reload,
        ),
      ).toBe("applied");
    }
    expect(rightTimeline.kill).toHaveBeenCalledTimes(2);
    expect(leftTimeline.kill).not.toHaveBeenCalled();
    expect(sibling.style.transform).toBe("translateX(12px)");
    expect(siblingScript?.isConnected).toBe(true);
    expect(right.querySelector("video")).toBe(selected);
    expect(doc.querySelectorAll("script")).toHaveLength(2);
    expect(set.mock.calls.every(([targets]) => !targets.includes(sibling))).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    // Production preview bundles can serve original scripts externally. A live
    // compiled timeline still permits a precisely scoped first replacement.
    for (const script of doc.querySelectorAll("script")) script.remove();
    expect(syncSourceCutGsapPreview(iframe, right, source, authored, 2.5, reload)).toBe("applied");
    expect(leftTimeline.kill).not.toHaveBeenCalled();
    expect(right.querySelector("video")).toBe(selected);
  });
});
