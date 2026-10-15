// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import { patchCutSoundEffect, readCutSoundEffect } from "../../utils/cutSoundEffects";
import { CutSoundEffect } from "./CutSoundEffect";

const mocks = vi.hoisted(() => ({
  source:
    '<html><body><div data-composition-id="scene"><audio id="camera" src="camera.mp4"></audio></div></body></html>',
  assets: [] as string[],
  save: vi.fn(),
  refresh: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("./useSourceCutChanges", () => ({
  useSourceCutChanges: () => ({
    source: mocks.source,
    busy: false,
    error: null,
    saveSourceCutChanges: mocks.save,
  }),
}));
vi.mock("../../contexts/FileManagerContext", () => ({
  useFileManagerContext: () => ({
    assets: mocks.assets,
    projectIdRef: { current: "synthetic-project" },
    refreshFileTree: mocks.refresh,
  }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  mocks.assets = ["assets/sneepcut-sfx-click-v1.wav"];
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(source = mocks.source) {
  mocks.source = source;
  const element = document.createElement("div");
  element.id = "scene-one";
  act(() =>
    root.render(
      <CutSoundEffect selection={makeSelection("scene-one", element)} recordEdit={vi.fn()} />,
    ),
  );
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === label)!;
  expect(button).toBeDefined();
  await act(async () => {
    button.click();
  });
}

describe("cut sound controls", () => {
  it("defaults to selected cut and applies to all only through its explicit action", async () => {
    render();
    await click("Apply to selected cut");
    expect(mocks.save.mock.calls[0][0].applyToAll).toBe(false);
    const changed = mocks.save.mock.calls[0][0].patch(mocks.source, { path: "scene.html" });
    expect(readCutSoundEffect(changed)).toMatchObject({ effect: "click", volume: 0.65 });
    await click("Apply to all cuts");
    expect(mocks.save.mock.calls[1][0].applyToAll).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("uploads generated WAV once and persists the server's actual asset path", async () => {
    mocks.assets = [];
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ files: ["assets/sneepcut-sfx-click-v1 (2).wav"] }), {
        status: 200,
      }),
    );
    render();
    await click("Apply to selected cut");
    const [url, request] = mocks.fetch.mock.calls[0];
    expect(url).toBe("/api/projects/synthetic-project/upload?dir=assets");
    expect((request.body as FormData).get("file")).toBeInstanceOf(File);
    const changed = mocks.save.mock.calls[0][0].patch(mocks.source, { path: "scenes/scene.html" });
    expect(readCutSoundEffect(changed)?.assetPath).toBe("../assets/sneepcut-sfx-click-v1 (2).wav");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not write a broken track after an upload failure", async () => {
    mocks.assets = [];
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload failed" }), { status: 500 }),
    );
    render();
    await click("Apply to selected cut");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Upload failed");
  });

  it("removes only the selected cut effect while retaining camera audio", async () => {
    render(
      patchCutSoundEffect(mocks.source, {
        effect: "click",
        volume: 0.3,
        assetPath: "assets/click.wav",
      }),
    );
    await click("Remove from selected cut");
    const operation = mocks.save.mock.calls[0][0];
    expect(operation.applyToAll).toBe(false);
    const changed = operation.patch(mocks.source, { path: "scene.html" });
    expect(readCutSoundEffect(changed)).toBeNull();
    expect(changed).toContain('id="camera"');
  });
});
