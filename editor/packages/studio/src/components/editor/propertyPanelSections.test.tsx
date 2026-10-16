// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlatTextSection } from "./propertyPanelFlatTextSection";
import { TextSection } from "./propertyPanelSections";
import { getCuratedComputedStyles, getInlineStyles } from "./domEditingDom";
import { buildDomEditStylePatchOperation } from "./domEditing";
import { applyPatchByTarget } from "../../utils/sourcePatcher";
import { normalizeDomEditStyleValue } from "../../utils/studioHelpers";
import type { DomEditSelection } from "./domEditingTypes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function makeElement(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  return {
    element: document.createElement("div"),
    id: "mono-label",
    selector: ".mono-label",
    label: "Mono Label",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: -24, width: 257, height: 29 },
    textContent: "PACKETS / FRAME",
    dataAttributes: {},
    inlineStyles: {},
    computedStyles: {},
    textFields: [
      {
        key: "field-0",
        label: "Text",
        value: "PACKETS / FRAME",
        tagName: "div",
        attributes: [],
        inlineStyles: { "letter-spacing": "3.96px" },
        computedStyles: {
          "font-family": "JetBrains Mono",
          "font-size": "22px",
          "font-weight": "400",
          "letter-spacing": "3.96px",
          "line-height": "normal",
          "text-align": "right",
          "text-transform": "none",
          "font-style": "normal",
          color: "rgb(255, 176, 32)",
        },
        source: "self",
      },
    ],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
    ...overrides,
  } as DomEditSelection;
}

function renderSection(
  overrides: Partial<DomEditSelection> = {},
  Component: typeof FlatTextSection | typeof TextSection = FlatTextSection,
  onSetTextFieldStyle = vi.fn(),
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const element = makeElement(overrides);
  act(() => {
    root.render(
      <Component
        element={element}
        styles={{}}
        fontAssets={[]}
        onSetText={vi.fn()}
        onSetTextFieldStyle={onSetTextFieldStyle}
        onAddTextField={vi.fn()}
        onRemoveTextField={vi.fn()}
      />,
    );
  });
  return { host, root };
}

describe("FlatTextSection", () => {
  it("renders the content block and every row from #10a", () => {
    const { host, root } = renderSection();
    expect(host.textContent).toContain("PACKETS / FRAME");
    expect(host.textContent).toContain("Font");
    expect(host.textContent).toContain("Weight");
    expect(host.textContent).toContain("Letter spacing");
    expect(host.textContent).toContain("Word spacing");
    expect(host.textContent).toContain("Line height");
    expect(host.textContent).toContain("Align");
    act(() => root.unmount());
  });

  it("colors letter-spacing mint (explicit, differs from 0px default) with a reset button", () => {
    const { host, root } = renderSection();
    const resetButtons = host.querySelectorAll('[data-flat-row-reset="true"]');
    expect(resetButtons.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  it("commits a font-weight change through onSetTextFieldStyle", () => {
    const onSetTextFieldStyle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const element = makeElement();
    act(() => {
      root.render(
        <FlatTextSection
          element={element}
          styles={{}}
          fontAssets={[]}
          onSetText={vi.fn()}
          onSetTextFieldStyle={onSetTextFieldStyle}
          onAddTextField={vi.fn()}
          onRemoveTextField={vi.fn()}
        />,
      );
    });
    const select = host.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("expected a weight <select>");
    act(() => {
      select.value = "700";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSetTextFieldStyle).toHaveBeenCalledWith("field-0", "font-weight", "700");
    act(() => root.unmount());
  });

  it("renders the flat layer list (not the legacy TextSection) for a multi-field element", () => {
    const { host, root } = renderSection({
      textFields: [
        makeElement().textFields[0],
        {
          key: "field-1",
          label: "Text",
          value: "SECOND FIELD",
          tagName: "div",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "self",
        },
      ],
    });
    // Legacy TextSection's own Section wrapper (data-panel-section="text")
    // must never render here — multi-field elements now go through the flat
    // FlatTextLayerList + FlatTextFieldEditor path end to end, not a
    // delegation to the legacy component.
    expect(host.querySelector('[data-panel-section="text"]')).toBeNull();
    // The flat layer list's own content must render.
    expect(host.textContent).toContain("Text layers");
    act(() => root.unmount());
  });
});

describe.each([
  ["flat", FlatTextSection],
  ["legacy", TextSection],
] as const)("%s word spacing", (_name, Component) => {
  it.each([
    ["3", "3px"],
    ["0.25em", "0.25em"],
    [" normal ", "normal"],
    ["-2", "-2px"],
  ])("persists and rereads %s without changing neighboring styles", (inputValue, expected) => {
    let source = '<p id="caption" style="word-spacing:1px;letter-spacing:2px;line-height:1.3">First caption</p>';
    const persistStyle = vi.fn((_field: string, property: string, value: string) => {
      source = applyPatchByTarget(
        source,
        { selector: "#caption" },
        buildDomEditStylePatchOperation(property, normalizeDomEditStyleValue(property, value)),
      );
    });
    const { host, root } = renderSection({}, Component, persistStyle);
    const label = [...host.querySelectorAll("span")].find((node) => node.textContent === "Word spacing");
    const input = label?.parentElement?.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    if (!input) throw new Error("Word spacing input is missing");
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, inputValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new Event("focusout", { bubbles: true })));
    expect(persistStyle).toHaveBeenCalledWith("field-0", "word-spacing", expected);

    const reloaded = document.createElement("div");
    reloaded.innerHTML = source;
    document.body.append(reloaded);
    const caption = reloaded.querySelector<HTMLElement>("#caption")!;
    expect(getInlineStyles(caption)["word-spacing"]).toBe(expected);
    expect(getCuratedComputedStyles(caption)["word-spacing"]).toBeTruthy();
    expect(caption.style.letterSpacing).toBe("2px");
    expect(caption.style.lineHeight).toBe("1.3");
    expect(caption.textContent).toBe("First caption");
    act(() => root.unmount());
  });
});

it("resets flat word spacing to inherited styling", () => {
  const onSetTextFieldStyle = vi.fn();
  const field = makeElement().textFields[0];
  const { host, root } = renderSection({
    textFields: [{ ...field, inlineStyles: { "word-spacing": "4px" }, computedStyles: { ...field.computedStyles, "word-spacing": "4px" } }],
  }, FlatTextSection, onSetTextFieldStyle);
  const label = [...host.querySelectorAll("span")].find((node) => node.textContent === "Word spacing");
  const reset = label?.parentElement?.querySelector<HTMLButtonElement>('[data-flat-row-reset="true"]');
  expect(reset).not.toBeNull();
  act(() => reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(onSetTextFieldStyle).toHaveBeenCalledWith("field-0", "word-spacing", "");
  act(() => root.unmount());
});
