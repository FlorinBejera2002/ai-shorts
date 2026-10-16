// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { applyStudioBoxSizeDraft, captureStudioBoxSize, restoreStudioBoxSize } from "./manualEdits";
import { buildBoxSizePatches, buildClearBoxSizePatches } from "./manualEditsDomPatches";
import { tryTextResizeIntercept } from "../../hooks/gsapTextResizeIntercept";
import type { DomEditSelection } from "./domEditing";
import { captureTextResize, rebaseTextResize } from "./manualTextResize";
import { reapplyPositionEditsAfterSeek } from "./manualEditsDom";

it("scales visible caption font, persists the value and restores on cancellation", () => {
  const caption = document.createElement("div");
  caption.style.fontSize = "40px";
  caption.innerHTML = "<span>Two words</span>";
  Object.defineProperties(caption, { offsetWidth: { value: 200 }, offsetHeight: { value: 50 } });
  document.body.append(caption);
  const before = captureStudioBoxSize(caption);
  applyStudioBoxSizeDraft(caption, { width: 300, height: 75 });
  expect(caption.style.fontSize).toBe("60px");
  applyStudioBoxSizeDraft(caption, { width: 400, height: 100 });
  expect(caption.style.fontSize).toBe("80px");
  expect(buildBoxSizePatches(caption)).toContainEqual({
    type: "inline-style",
    property: "font-size",
    value: "80px",
  });
  expect(buildClearBoxSizePatches(caption)).toContainEqual({
    type: "inline-style",
    property: "font-size",
    value: "40px",
  });
  restoreStudioBoxSize(caption, before);
  expect(caption.style.fontSize).toBe("40px");
  caption.remove();
});

it("saves font size and layout through the same GSAP gesture transaction", async () => {
  const caption = document.createElement("div");
  caption.id = "caption";
  caption.style.fontSize = "40px";
  caption.textContent = "Caption";
  Object.defineProperties(caption, { offsetWidth: { value: 200 }, offsetHeight: { value: 50 } });
  document.body.append(caption);
  applyStudioBoxSizeDraft(caption, { width: 300, height: 75 });
  const commit = vi.fn().mockResolvedValue(undefined);
  const result = await tryTextResizeIntercept(
    { element: caption, id: "caption", selector: "#caption" } as DomEditSelection,
    { width: 300, height: 75 },
    [],
    commit,
  );
  expect(result).toEqual({ status: "persisted" });
  expect(commit.mock.calls[0]?.[1]).toMatchObject({
    type: "add",
    properties: { fontSize: 60 },
    global: true,
  });
  expect(commit.mock.calls[1]?.[1]).toMatchObject({
    type: "add",
    properties: { width: 300, height: 75 },
  });
  caption.remove();
});

it("does not change typography of a media wrapper", () => {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = '<img src="logo.png"><span>Image description</span>';
  wrapper.style.fontSize = "20px";
  Object.defineProperties(wrapper, { offsetWidth: { value: 100 }, offsetHeight: { value: 100 } });
  applyStudioBoxSizeDraft(wrapper, { width: 200, height: 200 });
  expect(wrapper.style.fontSize).toBe("20px");
});

it("rebases an inspector font edit once before the next pinch while preserving repeat-pinch ratios", () => {
  const caption = document.createElement("div");
  caption.textContent = "Caption";
  caption.style.fontSize = "36px";
  Object.defineProperties(caption, { offsetWidth: { value: 200 }, offsetHeight: { value: 50 } });
  document.body.append(caption);
  applyStudioBoxSizeDraft(caption, { width: 280, height: 70 });
  expect(caption.style.fontSize).toBe("50.4px");
  caption.style.fontSize = "80px";
  reapplyPositionEditsAfterSeek(document);
  expect(caption.style.fontSize).toBe("80px");
  rebaseTextResize(caption, 280);
  applyStudioBoxSizeDraft(caption, { width: 392, height: 98 });
  expect(caption.style.fontSize).toBe("112px");
  rebaseTextResize(caption, 392);
  applyStudioBoxSizeDraft(caption, { width: 490, height: 122.5 });
  expect(caption.style.fontSize).toBe("140px");
  caption.remove();
});

it("keeps fractional text widths from rounding a phrase onto an extra line", () => {
  const caption = document.createElement("div");
  caption.textContent = "Two words";
  caption.style.cssText = "font-size:36px;width:201.39px";
  Object.defineProperties(caption, { offsetWidth: { value: 201 }, offsetHeight: { value: 41 } });
  document.body.append(caption);
  applyStudioBoxSizeDraft(caption, { width: 281.4, height: 57 });
  expect(Number.parseFloat(caption.style.fontSize)).toBeLessThanOrEqual((36 * 281) / 201.39);
  expect(caption.style.fontSize).toBe("50.18px");
  rebaseTextResize(caption, 281);
  expect(captureTextResize(caption).base).toBe("36");
  caption.remove();
});
