// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelTabButton } from "./PanelTabButton";

describe("PanelTabButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders a pill tab that reports its pressed state and uses tokens, not blue", () => {
    const onClick = vi.fn();
    act(() => {
      root.render(<PanelTabButton label="Design" tooltip="Styles" active onClick={onClick} />);
    });
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Design");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(button?.className).toContain("rounded-full");
    expect(button?.className).toContain("bg-studio-selected");
    expect(button?.className).not.toMatch(/neutral-|blue/);

    act(() => button?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("uses the muted inactive style when not active", () => {
    act(() => {
      root.render(
        <PanelTabButton label="Layers" tooltip="Stack" active={false} onClick={() => {}} />,
      );
    });
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.className).toContain("text-studio-muted");
  });
});
