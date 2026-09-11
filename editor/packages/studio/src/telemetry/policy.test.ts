// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { browserTelemetryAllowed } from "./policy";
import { __resetStudioCanaryCacheForTests, resolveCanary } from "./canary";
import { CANARIES } from "@hyperframes/core/canary-registry";

afterEach(() => {
  vi.unstubAllEnvs();
});

it.each([false, true])("keeps measurement disabled in DEV=%s without opt-out flags", (dev) => {
  vi.stubEnv("DEV", dev);
  vi.stubEnv("VITE_HYPERFRAMES_NO_TELEMETRY", "0");
  localStorage.clear();
  expect(browserTelemetryAllowed()).toBe(false);
  expect(localStorage.length).toBe(0);
});

it("does not enrol in percentage rollouts or mint an identity", () => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  delete window.__HF_CLI_CANARY_DECISIONS;
  __resetStudioCanaryCacheForTests();
  for (const canary of CANARIES) {
    expect(resolveCanary(canary.name).enabled).toBe(false);
  }
  expect(localStorage.length).toBe(0);
});
