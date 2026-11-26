import { describe, expect, it } from "vitest";
import { DEFAULT_FONT_FAMILIES } from "./propertyPanelHelpers";

describe("font picker defaults", () => {
  // Regression: Arial was only offered while it was the current font, so a user who
  // switched away from it could not pick it again.
  it("always offers the web-safe system fonts", () => {
    for (const family of ["Arial", "Helvetica", "Georgia", "Times New Roman"]) {
      expect(DEFAULT_FONT_FAMILIES).toContain(family);
    }
  });
});
