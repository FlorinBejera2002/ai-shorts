// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStudioLocale } from "../../i18n/translate";
import { usePlayerStore, type TimelineElement } from "../../player/store/playerStore";
import { groupAssets, searchAssets } from "./AssetsTab";
import { groupLayers, LayersPanel, layerKind } from "./LayersPanel";
import { renameError, RenameForm } from "./RenamePopover";
import { CATALOG_CATEGORIES } from "./BlocksTab";
import { formatShortDuration } from "./assetHelpers";
import { ImportQueue, useImportQueue, wasStored } from "./ImportQueue";
import { DeleteConfirmDialog } from "./PanelDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  setStudioLocale("en");
  vi.useRealTimers();
});

function mount(node: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

function el(input: Partial<TimelineElement> & { id: string }): TimelineElement {
  return { tag: "div", start: 0, duration: 4, track: 0, ...input };
}

describe("media helpers", () => {
  it("searches by file name and manifest description", () => {
    const manifest = new Map([["assets/b.mp4", { description: "Sunset on the beach" }]]);
    expect(searchAssets(["assets/a.mp4", "assets/b.mp4"], "sunset", manifest)).toEqual([
      "assets/b.mp4",
    ]);
    expect(searchAssets(["assets/a.mp4"], "A", manifest)).toEqual(["assets/a.mp4"]);
  });

  it("groups by category with used assets first", () => {
    const groups = groupAssets(["x.mp4", "y.mp4", "m.mp3", "f.ttf"], new Set(["y.mp4"]));
    expect(groups.video).toEqual(["y.mp4", "x.mp4"]);
    expect(groups.audio).toEqual(["m.mp3"]);
    expect(groups.fonts).toEqual(["f.ttf"]);
  });

  it("formats thumbnail durations as m:ss", () => {
    expect(formatShortDuration(72)).toBe("1:12");
    expect(formatShortDuration(0)).toBe("");
    expect(formatShortDuration(undefined)).toBe("");
  });
});

describe("rename validation", () => {
  it("rejects separators and parent segments", () => {
    expect(renameError("a/b.mp4")).toBe("media.renameInvalidSlash");
    expect(renameError("a\\b.mp4")).toBe("media.renameInvalidSlash");
    expect(renameError("a..b")).toBe("media.renameInvalid");
    expect(renameError("clip-2.mp4")).toBeNull();
  });

  it("shows the Romanian error and only commits a valid new name", () => {
    setStudioLocale("ro");
    const onCommit = vi.fn();
    const host = mount(<RenameForm initial="clip.mp4" onCommit={onCommit} onCancel={vi.fn()} />);
    const input = host.querySelector("input");
    if (!input) throw new Error("no input");
    const setValue = (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    act(() => setValue("clip..nou"));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Numele nu poate conține „..”");
    expect(onCommit).not.toHaveBeenCalled();
    act(() => setValue("clip-nou.mp4"));
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onCommit).toHaveBeenCalledWith("clip-nou.mp4");
  });
});

describe("delete confirmation", () => {
  it("uses the delete illustration and confirms", () => {
    setStudioLocale("ro");
    const onConfirm = vi.fn();
    mount(
      <DeleteConfirmDialog
        title="Șterge fișierul"
        message="Ștergi „a.html”?"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Șterge fișierul");
    expect(dialog?.querySelector('img[src="/illustrations/delete.webp"]')).not.toBeNull();
    const del = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Șterge",
    );
    act(() => del?.click());
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("catalog variants", () => {
  it("narrows Text and Subtitrări to their categories", () => {
    expect(CATALOG_CATEGORIES.elements).toBeNull();
    expect(CATALOG_CATEGORIES.text).toEqual(["text-effects", "captions"]);
    expect(CATALOG_CATEGORIES.subtitles).toEqual(["captions"]);
  });
});

describe("import queue", () => {
  function Harness({
    onImport,
    assets,
  }: {
    onImport: (files: FileList) => Promise<string[] | void>;
    assets?: string[];
  }) {
    const queue = useImportQueue(onImport, assets);
    return (
      <div>
        <button type="button" onClick={() => void queue.importFiles(fakeFiles())}>
          go
        </button>
        <span data-importing={String(queue.importing)} />
        <ImportQueue entries={queue.entries} />
      </div>
    );
  }
  function fakeFiles(): FileList {
    const file = new File(["x"], "interviu.mp4", { type: "video/mp4" });
    return {
      0: file,
      length: 1,
      item: () => file,
      [Symbol.iterator]: function* () {
        yield file;
      },
    } as unknown as FileList;
  }

  it("shows the uploading row, then Gata, then clears", async () => {
    vi.useFakeTimers();
    setStudioLocale("ro");
    let resolve: () => void = () => {};
    const onImport = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const host = mount(<Harness onImport={onImport} />);
    act(() => host.querySelector("button")?.click());
    expect(host.textContent).toContain("Se încarcă 1");
    expect(host.textContent).toContain("interviu.mp4");
    expect(host.querySelector("[data-importing]")?.getAttribute("data-importing")).toBe("true");
    await act(async () => resolve());
    expect(host.textContent).toContain("Gata");
    act(() => vi.advanceTimersByTime(4000));
    expect(host.textContent).not.toContain("interviu.mp4");
  });

  it("shows Eșuat when the upload stored nothing", async () => {
    setStudioLocale("ro");
    const host = mount(<Harness onImport={() => Promise.resolve([])} />);
    await act(async () => host.querySelector("button")?.click());
    expect(host.textContent).toContain("Eșuat");
    expect(host.textContent).not.toContain("Gata");
  });

  it("shows Gata when the returned paths include the file", async () => {
    setStudioLocale("ro");
    const host = mount(<Harness onImport={() => Promise.resolve(["assets/interviu.mp4"])} />);
    await act(async () => host.querySelector("button")?.click());
    expect(host.textContent).toContain("Gata");
    expect(host.textContent).not.toContain("Eșuat");
  });

  it("falls back to the asset list when the callback returns nothing", async () => {
    vi.useFakeTimers();
    setStudioLocale("ro");
    const host = mount(
      <Harness onImport={() => Promise.resolve()} assets={["assets/other.mp4"]} />,
    );
    await act(async () => host.querySelector("button")?.click());
    await act(async () => vi.advanceTimersByTime(300));
    expect(host.textContent).toContain("Eșuat");
  });

  it("counts a file renamed with the collision suffix as stored", () => {
    expect(wasStored("interviu.mp4", ["assets/interviu (2).mp4"])).toBe(true);
    expect(wasStored("interviu.mp4", ["assets/interviu-2.mp4"])).toBe(false);
    expect(wasStored("a.tar.gz", ["a (3).tar.gz"])).toBe(true);
  });

  it("ignores assets that existed before the upload", async () => {
    vi.useFakeTimers();
    setStudioLocale("ro");
    const host = mount(
      <Harness onImport={() => Promise.resolve()} assets={["assets/interviu.mp4"]} />,
    );
    await act(async () => host.querySelector("button")?.click());
    await act(async () => vi.advanceTimersByTime(300));
    expect(host.textContent).toContain("Eșuat");
  });

  it("marks the batch failed when the callback throws", async () => {
    setStudioLocale("ro");
    const host = mount(<Harness onImport={() => Promise.reject(new Error("413"))} />);
    await act(async () => host.querySelector("button")?.click());
    expect(host.textContent).toContain("Eșuat");
  });
});

describe("layers", () => {
  const elements = [
    el({ id: "v2", tag: "video", start: 8, track: 0 }),
    el({ id: "v1", tag: "video", start: 0, track: 0 }),
    el({ id: "t1", tag: "h1", track: 1, label: "Titlu" }),
    el({ id: "m1", tag: "audio", track: 2, timelineRole: "music" }),
  ];

  it("groups by track in time order and classifies kinds", () => {
    const groups = groupLayers(elements);
    expect(groups.map((g) => g.track)).toEqual([0, 1, 2]);
    expect(groups[0].elements.map((e) => e.id)).toEqual(["v1", "v2"]);
    expect(groups.map((g) => g.kind)).toEqual(["video", "text", "music"]);
    expect(layerKind(el({ id: "c", compositionSrc: "compositions/x.html" }))).toBe("composition");
  });

  it("selects a clip from its row and lists cuts in Romanian", () => {
    setStudioLocale("ro");
    usePlayerStore.setState({ elements });
    const host = mount(<LayersPanel />);
    expect(host.textContent).toContain("2 tăieturi");
    const row = host.querySelector<HTMLButtonElement>('[aria-label="Selectează Titlu"]');
    act(() => row?.click());
    expect(usePlayerStore.getState().selectedElementId).toBe("t1");
  });
});
