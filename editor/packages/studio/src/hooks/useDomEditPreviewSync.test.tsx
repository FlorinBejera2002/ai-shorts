// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import { installReactActEnvironment, makeSelection } from "./domSelectionTestHarness";
import { useDomEditPreviewSync } from "./useDomEditPreviewSync";

vi.mock("../components/editor/manualEdits", () => ({ reapplyPositionEditsAfterSeek: vi.fn() }));
installReactActEnvironment();

function sourceSelection(doc: Document): DomEditSelection {
  const element = doc.createElement("div");
  element.id = "scene-1";
  element.setAttribute("data-source-window", "");
  element.setAttribute("data-composition-file", "source-scene-1.html");
  doc.body.append(element);
  return { ...makeSelection("Source", element), sourceFile: "source-scene-1.html" };
}

async function setup() {
  const iframe = document.createElement("iframe");
  await new Promise<void>((resolve) => {
    iframe.addEventListener("load", () => resolve(), { once: true });
    document.body.append(iframe);
  });
  const doc = iframe.contentDocument!;
  const previous = sourceSelection(document.implementation.createHTMLDocument());
  const selectionRef = { current: previous as DomEditSelection | null };
  const build = vi.fn(async (element: HTMLElement) => ({ ...previous, element }));
  const apply = vi.fn((selection: DomEditSelection | null) => {
    selectionRef.current = selection;
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const params: Parameters<typeof useDomEditPreviewSync>[0] = {
    previewIframe: iframe,
    activeCompPath: "index.html",
    captionEditMode: false,
    domEditSelectionRef: selectionRef,
    domEditGroupSelectionsRef: { current: [previous] },
    domEditSelection: previous,
    applyDomSelection: apply,
    refreshDomEditGroupSelectionsFromPreview: vi.fn(async () => {}),
    buildDomSelectionFromTarget: build,
    refreshPreviewDocumentVersion: vi.fn(),
    syncPreviewHotkeys: vi.fn(),
    applyStudioManualEditsToPreviewRef: { current: vi.fn(async () => {}) },
  };
  function Harness() {
    useDomEditPreviewSync(params);
    return null;
  }
  act(() => root.render(<Harness />));
  let mounted = true;
  const unmount = () => {
    if (mounted) act(() => root.unmount());
    mounted = false;
  };
  return {
    iframe,
    doc,
    previous,
    selectionRef,
    build,
    apply,
    unmount,
    ready: () =>
      Object.defineProperty(iframe.contentWindow, "__renderReady", {
        value: true,
        configurable: true,
      }),
    signal: (source: Window | null = iframe.contentWindow, protocolVersion = 1) => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          data: {
            source: "hf-preview",
            type: "timeline",
            protocolVersion,
            capabilities: [],
            fps: { numerator: 30, denominator: 1 },
          },
        }),
      );
    },
    cleanup: () => {
      unmount();
      iframe.remove();
      host.remove();
    },
  };
}

describe("source cut selection after preview reload", () => {
  it("resumes a late external composition on readiness without another load or timer", async () => {
    const h = await setup();
    try {
      expect(h.apply).not.toHaveBeenCalled();
      await act(async () => h.signal());
      expect(h.build).not.toHaveBeenCalled();
      const live = sourceSelection(h.doc);
      h.ready();
      await act(async () => {
        h.signal(window);
        h.signal(h.iframe.contentWindow, 999);
      });
      expect(h.build).not.toHaveBeenCalled();
      await act(async () => h.signal());
      expect(h.selectionRef.current?.element).toBe(live.element);
      expect(h.apply).toHaveBeenCalledTimes(1);
      await act(async () => h.signal());
      expect(h.apply).toHaveBeenCalledTimes(1);
    } finally {
      h.cleanup();
    }
  });

  it("clears a deleted source host once the same preview is ready", async () => {
    const h = await setup();
    try {
      h.ready();
      await act(async () => h.signal());
      expect(h.selectionRef.current).toBeNull();
      expect(h.apply).toHaveBeenCalledWith(null, { revealPanel: false });
    } finally {
      h.cleanup();
    }
  });

  it.each(["selection", "document", "unmount"] as const)(
    "does not restore an async source probe superseded by %s",
    async (change) => {
      const h = await setup();
      try {
        const live = sourceSelection(h.doc);
        let resolve!: (value: DomEditSelection) => void;
        h.build.mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        );
        h.ready();
        await act(async () => h.signal());
        expect(h.build).toHaveBeenCalledTimes(1);
        if (change === "selection")
          h.selectionRef.current = makeSelection("Other", h.doc.createElement("span"));
        if (change === "document")
          Object.defineProperty(h.iframe, "contentDocument", {
            value: document.implementation.createHTMLDocument(),
            configurable: true,
          });
        if (change === "unmount") h.unmount();
        await act(async () => resolve(live));
        expect(h.apply).not.toHaveBeenCalled();
        if (change === "unmount") {
          await act(async () => h.signal());
          expect(h.build).toHaveBeenCalledTimes(1);
        }
      } finally {
        h.cleanup();
      }
    },
  );
});
