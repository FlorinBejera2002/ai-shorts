// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStudioLocale } from "../../i18n/translate";
import { ContextMenu } from "./AssetContextMenu";

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

function mountMenu(onDelete: (path: string) => void, onClose = vi.fn()): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <ContextMenu
        x={10}
        y={10}
        asset="assets/clip.mp4"
        onClose={onClose}
        onCopy={vi.fn()}
        onDelete={onDelete}
      />,
    );
  });
}

function findButton(text: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!match) throw new Error(`no button "${text}"`);
  return match;
}

describe("AssetContextMenu delete confirmation", () => {
  it("opens a translated dialog with the delete illustration instead of an inline strip", () => {
    setStudioLocale("en");
    mountMenu(vi.fn());

    act(() => findButton("Delete").click());

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-label")).toBe("Delete the file?");
    expect(dialog?.textContent).toContain("clip.mp4");
    expect(dialog?.querySelector('img[src="/illustrations/delete.webp"]')).not.toBeNull();
    expect(dialog?.innerHTML).not.toMatch(/red-|neutral-/);
  });

  it("uses Romanian copy when the locale is ro", () => {
    setStudioLocale("ro");
    mountMenu(vi.fn());

    act(() => findButton("Șterge").click());

    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Ștergi fișierul?",
    );
  });

  it("calls onDelete with the asset path when the destructive action is confirmed", () => {
    const onDelete = vi.fn();
    mountMenu(onDelete);

    act(() => findButton("Delete").click());
    act(() => findButton("Delete").click());

    expect(onDelete).toHaveBeenCalledWith("assets/clip.mp4");
  });
});
