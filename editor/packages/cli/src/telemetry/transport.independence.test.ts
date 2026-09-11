import { expect, it, spyOn } from "bun:test";
import * as childProcess from "node:child_process";
import { enqueue, flush, flushSync } from "./transport.js";
import { POSTHOG_API_KEY } from "./posthogKey.js";

it("drops directly enqueued events without network or exit-time workers", async () => {
  const request = spyOn(globalThis, "fetch");
  const spawn = spyOn(childProcess, "spawn");
  try {
    expect(POSTHOG_API_KEY).toBe("");
    enqueue("render_complete", { duration: 10 }, "synthetic-account");
    await flush();
    flushSync();
    await flush();
    expect(request).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
    spawn.mockRestore();
  }
});
