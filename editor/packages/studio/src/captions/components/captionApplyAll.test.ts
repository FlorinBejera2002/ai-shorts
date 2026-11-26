import { afterEach, describe, expect, it } from "vitest";
import { useCaptionStore } from "../store";
import { buildCaptionModel } from "../parser";
import { applyTransformToAllGroups } from "./captionApplyAll";
import { formatCaptionPercent } from "./captionPositionPercent";

function seedModel() {
  const words = "one two three four five six".split(" ");
  const model = buildCaptionModel(
    words.map((text, i) => ({ text, start: i, end: i + 0.5 })),
    { width: 1080, height: 1920, duration: 6, wordsPerGroup: 3 },
  );
  useCaptionStore.getState().setModel(model);
  return model;
}

afterEach(() => useCaptionStore.getState().reset());

describe("applyTransformToAllGroups", () => {
  it("copies the transform to every group, clears word overrides and undoes in one step", () => {
    const model = seedModel();
    const firstWord = [...model.segments.keys()][0];
    useCaptionStore.getState().updateSegmentStyle(firstWord, { rotation: 12, opacity: 0.5 });
    const before = useCaptionStore.getState().model;

    applyTransformToAllGroups({ x: 10, y: -40, scaleX: 1.2, scaleY: 1.2, rotation: 5 });

    const after = useCaptionStore.getState().model;
    for (const group of after?.groups.values() ?? []) {
      expect(group.style).toMatchObject({ x: 10, y: -40, scaleX: 1.2, rotation: 5 });
    }
    const word = after?.segments.get(firstWord)?.style;
    expect(word?.rotation).toBeUndefined();
    expect(word?.opacity).toBe(0.5);

    expect(useCaptionStore.getState().undo()).toBe(before);
  });
});

describe("formatCaptionPercent", () => {
  it("shows the offset as a percentage of the frame from the base position", () => {
    expect(formatCaptionPercent(50, 0, 1080)).toBe("50%");
    expect(formatCaptionPercent(74, 192, 1920)).toBe("84%");
  });
});
