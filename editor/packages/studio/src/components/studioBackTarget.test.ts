import { describe, expect, it } from "vitest";
import { appClipsUrl } from "./studioBackTarget";

describe("appClipsUrl", () => {
  it("keeps the English clips page unprefixed", () => {
    expect(appClipsUrl("https://sneepcut.com", "en")).toBe("https://sneepcut.com/dashboard/clips");
  });

  it("uses the /ro prefix for the Romanian app", () => {
    expect(appClipsUrl("https://sneepcut.com", "ro")).toBe(
      "https://sneepcut.com/ro/dashboard/clips",
    );
  });
});
