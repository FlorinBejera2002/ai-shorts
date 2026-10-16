// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { makeSelection, installReactActEnvironment } from "../../hooks/domSelectionTestHarness";
import { SourceCutCaptions } from "./SourceCutCaptions";

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./useSourceCutChanges", () => ({
  useSourceCutChanges: () => ({
    source:
      '<div class="story-caption" id="cue" data-start="0" data-duration="1" style="font-size:40px"><span data-caption-text>Text</span></div>',
    targets: [],
    parentSource: null,
    busy: false,
    error: null,
    saveSourceCutChanges: mocks.save,
  }),
}));

it("applies a typed subtitle size to all without first issuing a current-cut blur save", async () => {
  installReactActEnvironment();
  mocks.save.mockReset().mockResolvedValue(undefined);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <SourceCutCaptions
          selection={makeSelection("cut", document.createElement("div"))}
          recordEdit={vi.fn()}
        />,
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const button = host.querySelector<HTMLButtonElement>(
      '[aria-label="Apply subtitle size to all cuts"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "80");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: button })),
    );
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => button.click());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const request = mocks.save.mock.calls[0][0];
    expect(request.applyToAll).toBe(true);
    expect(
      request.patch(
        '<div class="story-caption" id="cue" style="font-size:40px"><span>Text</span></div>',
      ),
    ).toContain("font-size: 80px");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
