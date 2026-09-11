// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { shouldTrack, trackEvent } from "./client";
import { breadcrumbTrail, resetBreadcrumbs } from "./breadcrumbs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("retains local diagnostics without network traffic or tracking identifiers", () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetBreadcrumbs();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const beacon = vi.spyOn(navigator, "sendBeacon");
  trackEvent("studio_render", { status: "failed", comment: "private text" });
  vi.runAllTimers();
  window.dispatchEvent(new Event("pagehide"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(shouldTrack()).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  expect(beacon).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(breadcrumbTrail()).toContain("render:failed");
  expect(breadcrumbTrail()).not.toContain("private text");
});
