import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { registerPreviewRoutes } from "../../studio-server/src/routes/preview";
import type { StudioApiAdapter } from "@hyperframes/studio-server";

test("cancelled browser ranges do not crash Bun and later byte ranges remain correct", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-cancellation-"));
  const app = new Hono();
  const adapter: StudioApiAdapter = {
    listProjects: () => [],
    resolveProject: async (id) => ({ id, dir }),
    bundle: async () => null,
    lint: async () => ({ findings: [] }),
    runtimeUrl: "/api/runtime.js",
    rendersDir: () => join(dir, "renders"),
    startRender: () => ({ id: "unused", status: "rendering", progress: 0, outputPath: "" }),
  };
  registerPreviewRoutes(app, adapter);
  const bytes = Buffer.alloc(8 * 1024 * 1024, 37);
  await writeFile(join(dir, "source.mp4"), bytes);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
  const url = `http://127.0.0.1:${server.port}/projects/synthetic/preview/source.mp4`;
  try {
    for (let index = 0; index < 40; index++) {
      const abort = new AbortController();
      const response = await fetch(url, { headers: { Range: "bytes=0-" }, signal: abort.signal });
      expect(response.status).toBe(206);
      const reader = response.body!.getReader();
      expect((await reader.read()).value!.length).toBeGreaterThan(0);
      await reader.cancel();
      abort.abort();
    }
    await Bun.sleep(20);
    const response = await fetch(url, { headers: { Range: "bytes=100-1123" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe(`bytes 100-1123/${bytes.length}`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(100, 1124));
  } finally {
    await server.stop(true);
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);
