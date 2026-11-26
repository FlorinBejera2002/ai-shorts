// @vitest-environment happy-dom

import { createRef, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { t } from "../../../i18n/translate";
import { AssetMediaTransport } from "./AssetMediaTransport";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

function mountTransport(video: HTMLVideoElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const mediaRef = createRef<HTMLVideoElement>();
  mediaRef.current = video;
  root = createRoot(host);
  act(() => {
    root?.render(<AssetMediaTransport mediaRef={mediaRef} />);
  });
  return host;
}

/** The loop button is labelled with its action, so it reads "Disable" once looping is on. */
function loopButton(host: HTMLElement): HTMLButtonElement {
  const labels = [t("preview.loopOn"), t("preview.loopOff")];
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((el) =>
    labels.includes(el.getAttribute("aria-label") ?? ""),
  );
  if (!button) throw new Error("loop button not rendered");
  return button;
}

describe("AssetMediaTransport loop toggle", () => {
  it("repaints the loop state when toggled on a paused media element", () => {
    const video = document.createElement("video");
    const host = mountTransport(video);
    expect(video.loop).toBe(false);
    expect(loopButton(host).getAttribute("aria-pressed")).toBe("false");

    act(() => {
      loopButton(host).click();
    });
    expect(video.loop).toBe(true);
    expect(loopButton(host).getAttribute("aria-pressed")).toBe("true");
    expect(loopButton(host).getAttribute("aria-label")).toBe(t("preview.loopOff"));

    act(() => {
      loopButton(host).click();
    });
    expect(video.loop).toBe(false);
    expect(loopButton(host).getAttribute("aria-pressed")).toBe("false");
  });
});
