// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS,
  CROP,
  EDITING,
  GESTURES,
  KEYFRAMES,
  NAVIGATION,
  PANELS,
  PLAYBACK,
  TOOLS,
  WORK_AREA_KEYS,
  shortcutKeyLabel,
  type ShortcutRow,
} from "./TimelineToolbarShortcutData";

afterEach(() => {
  vi.unstubAllGlobals();
});

const allRows: readonly ShortcutRow[] = [
  ...[PLAYBACK, PANELS, EDITING, TOOLS, KEYFRAMES, NAVIGATION, GESTURES, CANVAS, CROP].flatMap(
    (group) => group.rows,
  ),
  ...WORK_AREA_KEYS,
];

function keyLabels(platform: string): string[] {
  vi.stubGlobal("navigator", { platform });
  return allRows.flatMap(([, keys]) => keys.map(shortcutKeyLabel));
}

describe("timeline shortcut labels", () => {
  it("shows Ctrl, Alt and no Apple glyphs on Windows", () => {
    const labels = keyLabels("Win32");
    expect(labels.filter((label) => label === "⌘" || label === "⌥")).toEqual([]);
    expect(labels).toContain("Ctrl");
    expect(labels).toContain("Alt");
  });

  it("keeps ⌘ and ⌥ on Apple devices", () => {
    const labels = keyLabels("MacIntel");
    expect(labels).toContain("⌘");
    expect(labels).toContain("⌥");
    expect(labels).not.toContain("Ctrl");
  });
});
