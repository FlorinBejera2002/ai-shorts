// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { PlayerControls, type TransportLayout } from "./PlayerControls";

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  usePlayerStore.setState({ duration: 10, currentTime: 2, timelineReady: true });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

function renderControls(layout: TransportLayout) {
  act(() => {
    root.render(<PlayerControls onTogglePlay={() => {}} onSeek={() => {}} layout={layout} />);
  });
}

describe("PlayerControls readout", () => {
  it("repaints the live time when the layout switches while paused", () => {
    renderControls("desktop");
    const desktopReadout = host.querySelector("button[aria-label] > span:not([class])");
    expect(desktopReadout?.textContent).not.toBe("");

    renderControls("fullscreen");
    const fullscreenReadout = host.querySelector("span.whitespace-nowrap.tabular-nums");
    expect(fullscreenReadout?.textContent).not.toBe("");
  });
});
