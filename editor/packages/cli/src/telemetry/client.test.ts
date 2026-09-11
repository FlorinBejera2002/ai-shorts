import { afterEach, expect, it, vi } from "vitest";
import { enqueue, flush, flushSync } from "./transport.js";
import { resetTelemetryPostureCache, shouldTrack, trackEvent } from "./client.js";
import { effectiveTelemetryStatus } from "./policy.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetTelemetryPostureCache();
});

it("cannot enable upstream delivery through environment flags or persisted opt-in", async () => {
  vi.stubEnv("HYPERFRAMES_NO_TELEMETRY", "0");
  vi.stubEnv("DO_NOT_TRACK", "0");
  vi.stubEnv("NODE_ENV", "production");
  resetTelemetryPostureCache();
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  expect(shouldTrack()).toBe(false);
  expect(effectiveTelemetryStatus(true).enabled).toBe(false);
  trackEvent("render_complete", { duration: 10 });
  enqueue("direct_transport_call", { duration: 10 }, "test-account");
  await flush();
  flushSync();
  await flush();
  expect(request).not.toHaveBeenCalled();
});
