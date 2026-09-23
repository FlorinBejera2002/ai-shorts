import { expect, test } from "bun:test";
import { Hono } from "hono";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerRenderRoutes } from "../../studio-server/src/routes/render";
import { fileContentVersion } from "../../studio-server/src/helpers/fileVersion";
import type { RenderJobState, StudioApiAdapter } from "../../studio-server/src/types";

test("agent render precondition, progress, output verification and cancellation use actual state", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-agent-render-"));
  let state: RenderJobState | undefined;
  let calls = 0;
  let cancelled = false;
  const adapter: StudioApiAdapter = {
    listProjects: () => [],
    resolveProject: async (id) => ({ id, dir: root }),
    bundle: async () => null,
    lint: async () => ({ findings: [] }),
    runtimeUrl: "/runtime.js",
    rendersDir: () => join(root, "renders"),
    startRender: (options) => {
      calls++;
      state = {
        id: options.jobId,
        status: "rendering",
        progress: 0,
        outputPath: options.outputPath,
        cancel: () => {
          cancelled = true;
        },
      };
      return state;
    },
  };
  const app = new Hono();
  registerRenderRoutes(app, adapter);
  try {
    const html = "<html><body>test</body></html>";
    await writeFile(join(root, "index.html"), html);
    const start = (expected: string) =>
      app.request("/projects/project/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", "If-Match": expected },
        body: JSON.stringify({ format: "mp4" }),
      });
    expect((await start('"stale"')).status).toBe(409);
    expect(calls).toBe(0);
    const queued = await start(fileContentVersion(html));
    expect(queued.status).toBe(200);
    const receipt = await queued.json();
    if (!state) throw new Error("Missing render state");
    expect((await (await app.request(`/render/${receipt.jobId}/status`)).json()).verified).toBe(
      false,
    );
    state.status = "complete";
    state.progress = 100;
    expect((await (await app.request(`/render/${receipt.jobId}/status`)).json()).verified).toBe(
      false,
    );
    await writeFile(state.outputPath, "synthetic-render-fixture");
    expect((await (await app.request(`/render/${receipt.jobId}/status`)).json()).verified).toBe(
      true,
    );
    state.status = "rendering";
    expect(
      (await (await app.request(`/render/${receipt.jobId}/cancel`, { method: "POST" })).json())
        .status,
    ).toBe("cancelled");
    expect(cancelled).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
