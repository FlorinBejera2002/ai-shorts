// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderQueue } from "./RenderQueue";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderPanel(props: {
  historyLoading: boolean;
  hiddenCount: number;
  onShowHidden?: () => void;
}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <RenderQueue
        jobs={[]}
        projectId="demo"
        onDelete={vi.fn()}
        onClearCompleted={vi.fn()}
        onStartRender={vi.fn()}
        isRendering={false}
        ffmpeg={{ ok: true }}
        ffmpegChecking={false}
        onRecheckFfmpeg={vi.fn()}
        {...props}
      />,
    );
  });
  return host;
}

describe("RenderQueue history states", () => {
  it("shows a loading status, not the empty state, while history is pending", () => {
    const host = renderPanel({ historyLoading: true, hiddenCount: 0 });
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(host.textContent).not.toContain("No renders yet");
  });

  it("offers hidden renders back when every row is hidden", () => {
    const onShowHidden = vi.fn();
    const host = renderPanel({ historyLoading: false, hiddenCount: 2, onShowHidden });
    expect(host.textContent).toContain("2 hidden");
    const button = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Show hidden",
    );
    if (!button) throw new Error("show hidden button did not render");
    act(() => button.click());
    expect(onShowHidden).toHaveBeenCalledTimes(1);
  });
});
