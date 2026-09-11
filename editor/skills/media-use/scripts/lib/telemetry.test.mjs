import { strict as assert } from "node:assert";
import { test } from "node:test";
import { __anonymousIdForTest, __resetTelemetryForTest, optedOut, track } from "./telemetry.mjs";
test("media workflows cannot enable upstream analytics or create an identity", async () => {
  const names = [
    "DO_NOT_TRACK",
    "HYPERFRAMES_NO_TELEMETRY",
    "MEDIA_USE_TELEMETRY_HOST",
    "NODE_ENV",
  ];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("Unexpected analytics request");
  };
  try {
    process.env.DO_NOT_TRACK = "0";
    process.env.HYPERFRAMES_NO_TELEMETRY = "0";
    process.env.MEDIA_USE_TELEMETRY_HOST = "https://analytics.invalid";
    process.env.NODE_ENV = "production";
    __resetTelemetryForTest();
    assert.equal(optedOut(), true);
    assert.equal(__anonymousIdForTest(), null);
    await track("media_resolved", { provider: "local", source: "generated" });
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
