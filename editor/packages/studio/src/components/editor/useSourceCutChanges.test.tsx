// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useSourceCutChanges } from "./useSourceCutChanges";
import type { DomEditSelection } from "./domEditingTypes";

const mocks = vi.hoisted(() => ({ readProjectFile: vi.fn() }));
vi.mock("../../contexts/FileManagerContext", () => ({ useFileManagerContext: () => mocks }));
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContext: () => ({ activeCompPath: "index.html", projectId: "fixture" }),
  useStudioPlaybackContext: () => ({ refreshKey: 0 }),
}));

it("loads a selected imported host from its owning file rather than its child composition file", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.innerHTML =
    '<main></main><div data-composition-id="main" data-composition-file="index.html"><div id="scene-1" data-source-window data-composition-id="source-scene-1" data-composition-file="source-scene-1.html"></div></div>';
  const parent =
    '<div id="scene-1" data-source-window data-composition-src="source-scene-1.html" data-start="0" data-duration="2"></div>';
  const child = '<video class="source-video" src="assets/source.mp4"></video>';
  mocks.readProjectFile.mockImplementation(async (path: string) =>
    path === "index.html" ? parent : child,
  );
  const selection = {
    id: "scene-1",
    sourceFile: "source-scene-1.html",
    element: document.getElementById("scene-1"),
  } as DomEditSelection;
  let result: ReturnType<typeof useSourceCutChanges> | undefined;
  function Harness() {
    result = useSourceCutChanges({ selection, recordEdit: vi.fn() });
    return null;
  }
  const root = createRoot(document.querySelector("main")!);
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    expect(mocks.readProjectFile.mock.calls.map(([path]) => path)).toEqual([
      "index.html",
      "source-scene-1.html",
    ]);
    expect(result?.source).toBe(child);
    expect(result?.error).toBeNull();
  } finally {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  }
});
