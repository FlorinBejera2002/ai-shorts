import { afterEach, describe, expect, it } from "vitest";
import {
  closePreviewPanel,
  getPreviewPanel,
  setPreviewPanel,
  togglePreviewPanel,
} from "./previewUiStore";

afterEach(() => setPreviewPanel(null));

describe("preview panel store", () => {
  it("opens one panel at a time and toggles it closed", () => {
    togglePreviewPanel("phonePlayback");
    expect(getPreviewPanel()).toBe("phonePlayback");
    togglePreviewPanel("phoneMore");
    expect(getPreviewPanel()).toBe("phoneMore");
    togglePreviewPanel("phoneMore");
    expect(getPreviewPanel()).toBeNull();
  });

  it("ignores a stale close for a panel that is no longer open", () => {
    setPreviewPanel("phoneTools");
    closePreviewPanel("phoneMore");
    expect(getPreviewPanel()).toBe("phoneTools");
    closePreviewPanel("phoneTools");
    expect(getPreviewPanel()).toBeNull();
  });
});
