// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PanelChip, PanelSegment } from "./panelKit";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

function render(node: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

describe("panelKit touch targets", () => {
  // happy-dom does not evaluate media queries, so these assert the phone-only utility class
  // that gives the 44px target below the sm breakpoint.
  it("gives filter chips a 44px phone target", () => {
    const container = render(
      <PanelChip pressed={false} onClick={() => {}}>
        Toate
      </PanelChip>,
    );
    const chip = container.querySelector("button");
    expect(chip?.className).toContain("max-sm:h-11");
  });

  it("gives segment options a 44px phone target", () => {
    const container = render(
      <PanelSegment
        label="Vizualizare"
        options={[
          { value: "project", label: "Proiect" },
          { value: "all", label: "Toate" },
        ]}
        value="project"
        onChange={() => {}}
      />,
    );
    const options = Array.from(container.querySelectorAll("button"));
    expect(options).toHaveLength(2);
    for (const option of options) expect(option.className).toContain("max-sm:h-11");
  });
});
