// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { furthestClipEndFromSource } from "./timelineElementHelpers";

describe("source composition duration", () => {
  it("uses the edited host window instead of the full source duration inside it", () => {
    expect(
      furthestClipEndFromSource(`<div data-composition-id="main" data-duration="4">
      <div data-composition-id="source-one" data-start="0" data-duration="1.4" data-playback-start="1">
        <video data-start="0" data-duration="60"></video>
        <div data-start="5" data-duration="1">Caption</div>
      </div>
      <div data-composition-id="source-two" data-start="2" data-duration="2.5" data-playback-start="4">
        <video data-start="0" data-duration="90"></video>
      </div>
    </div>`),
    ).toBe(4.5);
  });

  it("includes source content when that source is opened as the active composition", () => {
    expect(
      furthestClipEndFromSource(`<div data-composition-id="source-one" data-duration="60">
      <video data-start="0" data-duration="60"></video>
      <div data-start="5" data-duration="1">Caption</div>
    </div>`),
    ).toBe(60);
  });
});
