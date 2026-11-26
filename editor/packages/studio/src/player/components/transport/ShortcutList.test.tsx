// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutSectionList } from "./ShortcutList";
import { TABS_SECTION } from "./shortcutSections";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShortcutSectionList", () => {
  it("labels the command modifier Ctrl on Windows", () => {
    vi.stubGlobal("navigator", { platform: "Win32" });
    const markup = renderToStaticMarkup(<ShortcutSectionList section={TABS_SECTION} />);
    expect(markup).toContain("Ctrl");
    expect(markup).not.toContain("⌘");
  });

  it("keeps the ⌘ symbol on Apple devices", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    const markup = renderToStaticMarkup(<ShortcutSectionList section={TABS_SECTION} />);
    expect(markup).toContain("⌘");
    expect(markup).not.toContain("Ctrl");
  });
});
