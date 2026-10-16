// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import { CutSettingsScopeProvider } from "./CutSettingsScope";
import { CutMediaApplyControls } from "./CutMediaApplyControls";
import { SourceCutMediaSettings } from "./SourceCutMediaSettings";
import type { SourceCutPatch } from "../../utils/sourceCutChanges";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  source: '<video class="source-video" style="object-fit:cover"></video>',
}));
vi.mock("./useSourceCutChanges", () => ({
  useSourceCutChanges: () => ({
    source: mocks.source,
    busy: false,
    error: null,
    saveSourceCutChanges: mocks.save,
  }),
}));

it("shows an explicit per-setting Apply all for a compiled source cut, excluding a global music track", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.save.mockReset().mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const fixture = document.createElement("div");
  fixture.innerHTML =
    '<div id="cut" data-source-window data-composition-file="source-scene-1.html"><video class="source-video" data-volume="0.5" style="object-fit:cover"></video></div><audio id="music"></audio>';
  const media = fixture.querySelector("video")!;
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <CutSettingsScopeProvider selection={makeSelection("video", media)} recordEdit={vi.fn()}>
          <CutMediaApplyControls />
        </CutSettingsScopeProvider>,
      ),
    );
    const button = host.querySelector<HTMLButtonElement>('[aria-label="Apply volume to all cuts"]');
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    const request = mocks.save.mock.calls[0][0] as { applyToAll: boolean; patch: SourceCutPatch };
    expect(request.applyToAll).toBe(true);
    const after = request.patch(
      '<video class="source-video" data-volume="1" style="object-fit:contain"></video>',
      { id: "cut", path: "source-scene-1.html", start: 0, sourceStart: 0, duration: 2 },
    );
    expect(after).toContain('data-volume="0.5"');
    expect(after).toContain("object-fit:contain");
    const appearance = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
      item.textContent?.includes("Apply image styling and static layout to all cuts"),
    );
    expect(appearance).toBeDefined();
    await act(async () => appearance!.click());
    expect(mocks.save.mock.calls[1][0].applyToAll).toBe(true);
    expect(mocks.save.mock.calls[1][0].label).toBe("All cuts: image styling and static layout");
    await act(async () =>
      root.render(
        <CutSettingsScopeProvider
          selection={makeSelection("music", fixture.querySelector("audio")!)}
          recordEdit={vi.fn()}
        >
          <CutMediaApplyControls />
        </CutSettingsScopeProvider>,
      ),
    );
    expect(host.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("changes framing on the selected cut by default and copies it only from the explicit button", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.save.mockReset().mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const selection = makeSelection("cut", document.createElement("div"));
  try {
    await act(async () =>
      root.render(<SourceCutMediaSettings selection={selection} recordEdit={vi.fn()} />),
    );
    const select = host.querySelector<HTMLSelectElement>('[aria-label="Cut fit"]')!;
    await act(async () => {
      select.value = "contain";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.save.mock.calls[0][0].applyToAll).toBe(false);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Apply fit to all cuts"]')!.click(),
    );
    expect(mocks.save.mock.calls[1][0].applyToAll).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
