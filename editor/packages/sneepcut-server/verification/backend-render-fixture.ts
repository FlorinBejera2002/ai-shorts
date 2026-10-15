// Trusted, loopback-only test process. Production always uses the sandbox adapter.
import { timingSafeEqual } from "node:crypto";
import { drainBrowserPool } from "../../engine/src/index";
import { createStudioServer, closeThumbnailBrowser } from "../../cli/src/server/studioServer";
import type { RenderJobState } from "@hyperframes/studio-server";
import { CompositionStore } from "../src/composition-store";
import { createCompositionService } from "../src/composition-service";

if (process.env.SNEEPCUT_TRUSTED_RENDER_FIXTURE !== "1") {
  throw new Error("This renderer is only for synthetic integration fixtures");
}
const root = process.env.STUDIO_FIXTURE_ROOT;
const mediaOrigin = process.env.STUDIO_FIXTURE_MEDIA_ORIGIN;
const secret = process.env.STUDIO_FIXTURE_SECRET;
if (!root || !mediaOrigin || !secret || new URL(mediaOrigin).hostname !== "127.0.0.1") {
  throw new Error("A disposable project directory and loopback media server are required");
}
const jobs = new Set<RenderJobState & { settled: Promise<void> }>();
let stopping = false;
let shutdown: Promise<void> | undefined;
function stopFixture() {
  shutdown ??= (async () => {
    stopping = true;
    for (const job of jobs) job.cancel?.();
    // Closing the engine pool releases Chrome and its temporary profile, including
    // launches still in progress when a failed test requests cleanup.
    await closeThumbnailBrowser();
    await drainBrowserPool();
    await Promise.allSettled([...jobs].map((job) => job.settled));
    await drainBrowserPool();
  })();
  return shutdown;
}
const render = createCompositionService({
  store: new CompositionStore(root),
  mediaOrigin,
  secret,
  render(options) {
    if (stopping) throw new Error("The test renderer is shutting down");
    const runtime = createStudioServer({
      projectDir: options.project.dir,
      projectName: options.project.id,
    });
    let state: RenderJobState;
    try {
      state = runtime.adapter.startRender(options);
    } catch (error) {
      runtime.watcher.close();
      throw error;
    }
    const settled = new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (state.status !== "rendering") {
          clearInterval(timer);
          runtime.watcher.close();
          jobs.delete(job);
          resolve();
        }
      }, 100);
    });
    const originalCancel = state.cancel;
    const job = Object.assign(state, { settled, cancel: () => originalCancel?.() });
    jobs.add(job);
    return job;
  },
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 30,
  async fetch(request) {
    if (new URL(request.url).pathname === "/__fixture/shutdown") {
      const supplied = Buffer.from(request.headers.get("X-Studio-Fixture-Secret") ?? "");
      const expected = Buffer.from(secret);
      if (
        request.method !== "POST" ||
        request.headers.has("Origin") ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        return Response.json({ error: "Fixture shutdown rejected" }, { status: 403 });
      }
      await stopFixture();
      setTimeout(() => {
        server.stop(true);
        process.exit(0);
      }, 100);
      return Response.json({ stopped: true });
    }
    if (stopping) return Response.json({ error: "Fixture is shutting down" }, { status: 503 });
    const response = await render(request);
    if (!response.ok)
      console.error("Studio fixture request failed:", await response.clone().text());
    else if (response.headers.get("content-type")?.includes("application/json")) {
      const state = await response.clone().json();
      if (state.status === "failed") console.error("Studio fixture render failed:", state.error);
    }
    return response;
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopFixture()
      .then(() => {
        server.stop(true);
        process.exit(0);
      })
      .catch((error) => {
        console.error("Studio fixture shutdown failed:", error);
        process.exit(1);
      });
  });
}
console.log(`STUDIO_FIXTURE_URL http://127.0.0.1:${server.port}`);
