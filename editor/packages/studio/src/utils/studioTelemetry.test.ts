// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { flushViaBeacon, trackStudioEvent } from "./studioTelemetry";
import { breadcrumbTrail, resetBreadcrumbs } from "../telemetry/breadcrumbs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps legacy callers local even when flushed on tab close", () => {
  vi.useFakeTimers();
  resetBreadcrumbs();
  localStorage.clear();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const beacon = vi.spyOn(navigator, "sendBeacon");
  trackStudioEvent("playback", { action: "pause", file: "private-file.mp4" });
  flushViaBeacon();
  vi.runAllTimers();
  window.dispatchEvent(new Event("visibilitychange"));
  expect(fetch).not.toHaveBeenCalled();
  expect(beacon).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(breadcrumbTrail()).toContain("playback:pause");
  expect(breadcrumbTrail()).not.toContain("private-file");
});
