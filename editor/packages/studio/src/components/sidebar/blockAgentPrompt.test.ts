import { describe, expect, it } from "vitest";
import { buildAgentPrompt, type CompositionContext } from "./blockAgentPrompt";

function promptFor(elements: CompositionContext["elements"]): string {
  return buildAgentPrompt("Glitch", "glitch", "", "vfx", "hyperframes:block", {
    currentTime: 0,
    activeCompPath: null,
    elements,
  });
}

describe("block agent prompt", () => {
  it("reports the highest track number, not the element count", () => {
    const clips = Array.from({ length: 18 }, (_, i) => ({
      id: `clip-${i}`,
      start: i,
      duration: 1,
      track: 0,
    }));
    expect(promptFor(clips)).toContain("Highest track index: 0");
    expect(promptFor([...clips, { id: "title", start: 0, duration: 2, track: 3 }])).toContain(
      "Highest track index: 3",
    );
  });
});
