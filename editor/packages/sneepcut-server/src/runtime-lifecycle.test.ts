import { expect, it } from "bun:test";
import { RuntimeLifecycle } from "./runtime-lifecycle";
import { createUserRuntime } from "./runtime";
import { ProjectStore, type StoredProject } from "./store";

it("drains an active account API request and rejects later requests", async () => {
  const entered = Promise.withResolvers<void>();
  const result = Promise.withResolvers<StoredProject[]>();
  let calls = 0;
  class DeferredStore extends ProjectStore {
    override async list() {
      calls++;
      entered.resolve();
      return result.promise;
    }
  }
  const runtime = createUserRuntime(
    "11111111-1111-4111-8111-111111111111",
    new DeferredStore("unused"),
  );
  const request = runtime.api.request("/projects");
  await entered.promise;
  let closed = false;
  const closing = runtime.close().then(() => {
    closed = true;
  });
  expect((await runtime.api.request("/projects")).status).toBe(410);
  expect(closed).toBe(false);
  result.resolve([]);
  expect((await request).status).toBe(200);
  await closing;
  expect(closed).toBe(true);
  expect(calls).toBe(1);
});

it("waits for admitted mutations and actual job completion before disposing account state", async () => {
  const runtime = new RuntimeLifecycle();
  const releaseRequest = runtime.admitRequest();
  const completion = Promise.withResolvers<void>();
  let cancelled = false;
  let disposed = false;
  runtime.trackJob({
    cancel: () => {
      cancelled = true;
    },
    settled: completion.promise,
  });
  const closing = runtime.close(() => {
    disposed = true;
  });
  expect(cancelled).toBe(true);
  expect(runtime.signal.aborted).toBe(true);
  expect(runtime.admitRequest()).toBeNull();
  expect(() => runtime.ensureOpen()).toThrow("closed");
  expect(disposed).toBe(false);
  releaseRequest?.();
  await Promise.resolve();
  // A job's visible status can already be cancelled while its final IO is pending.
  expect(disposed).toBe(false);
  completion.resolve();
  await closing;
  expect(disposed).toBe(true);
  expect(
    runtime.close(() => {
      throw new Error("must dispose only once");
    }),
  ).toBe(closing);
});

it("also cancels jobs started by a request that was already admitted during shutdown", async () => {
  const runtime = new RuntimeLifecycle();
  const releaseRequest = runtime.admitRequest();
  const completion = Promise.withResolvers<void>();
  let cancelled = false;
  let disposed = false;
  const closing = runtime.close(() => {
    disposed = true;
  });
  runtime.trackJob({
    cancel: () => {
      cancelled = true;
    },
    settled: completion.promise,
  });
  expect(cancelled).toBe(true);
  releaseRequest?.();
  await Promise.resolve();
  expect(disposed).toBe(false);
  completion.resolve();
  await closing;
  expect(disposed).toBe(true);
});
