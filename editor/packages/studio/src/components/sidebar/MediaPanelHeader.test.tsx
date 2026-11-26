// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStudioLocale } from "../../i18n/translate";
import { MediaPanelHeader, type MediaPanelHeaderProps } from "./MediaPanelHeader";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  setStudioLocale("en");
  vi.restoreAllMocks();
});

function baseProps(overrides: Partial<MediaPanelHeaderProps> = {}): MediaPanelHeaderProps {
  return {
    scope: "local",
    onScopeChange: vi.fn(),
    showFilters: true,
    searchQuery: "",
    onSearchChange: vi.fn(),
    showSearch: true,
    activeCategory: "all",
    onCategoryChange: vi.fn(),
    categoryCounts: { all: 6, video: 4, audio: 1 },
    categoryOrder: ["audio", "images", "video", "fonts"],
    usage: { used: 2, unused: 4 },
    usageFilter: "all",
    onUsageFilterChange: vi.fn(),
    ...overrides,
  };
}

function mount(props: MediaPanelHeaderProps): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<MediaPanelHeader {...props} />);
  });
  return host;
}

/** Finds a button by its visible label. Filter chips read "Label N", so they match on "Label ". */
function buttonWithText(host: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(host.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").startsWith(text),
  );
  if (!match) throw new Error(`no button with text ${text}`);
  return match;
}

describe("MediaPanelHeader", () => {
  it("renders the Romanian copy and the chip counts in ro", () => {
    setStudioLocale("ro");
    const host = mount(baseProps());
    expect(host.querySelector("input")?.getAttribute("placeholder")).toBe("Caută în media");
    expect(buttonWithText(host, "Toate6").textContent).toContain("6");
    expect(buttonWithText(host, "Video").textContent).toContain("4");
    expect(buttonWithText(host, "În uz").textContent).toContain("2");
    expect(buttonWithText(host, "Neutilizat").textContent).toContain("4");
  });

  it("marks the active category chip as pressed and reports toggles", () => {
    const props = baseProps({ activeCategory: "video" });
    const host = mount(props);
    expect(buttonWithText(host, "Video").getAttribute("aria-checked")).toBe("true");
    expect(buttonWithText(host, "All6").getAttribute("aria-checked")).toBe("false");
    act(() => buttonWithText(host, "Audio").click());
    expect(props.onCategoryChange).toHaveBeenCalledWith("audio");
  });

  it("hides the usage chips when every asset is used or none is", () => {
    const host = mount(baseProps({ usage: null }));
    expect(host.textContent).not.toContain("In use");
  });

  it("exposes the scope as a radio group with Proiect / Toate", () => {
    setStudioLocale("ro");
    const props = baseProps();
    const host = mount(props);
    const scope = host.querySelector('[role="radiogroup"][aria-label="Sursa media"]');
    expect(scope?.querySelectorAll('[role="radio"]').length).toBe(2);
    const allButton = scope?.querySelectorAll<HTMLButtonElement>("button")[1];
    act(() => allButton?.click());
    expect(props.onScopeChange).toHaveBeenCalledWith("global");
  });
});
