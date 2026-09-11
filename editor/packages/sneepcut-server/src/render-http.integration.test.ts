import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileServer as engineServer } from "../../engine/src/services/fileServer";
import { createFileServer as producerServer } from "../../producer/src/services/fileServer";

for (const [name, start] of [
  ["engine", engineServer],
  ["producer", producerServer],
] as const) {
  test(`${name} file server preserves native HTTP globals for the SneepCut host`, async () => {
    const root = await mkdtemp(join(tmpdir(), "sneepcut-http-regression-"));
    const nativeRequest = globalThis.Request;
    const nativeResponse = globalThis.Response;
    let server: Awaited<ReturnType<typeof start>> | undefined;
    try {
      await writeFile(
        join(root, "index.html"),
        "<!doctype html><html><body>Synthetic render</body></html>",
      );
      server = await start({ projectDir: root, port: 0, headScripts: [], bodyScripts: [] });
      expect(globalThis.Request).toBe(nativeRequest);
      expect(globalThis.Response).toBe(nativeResponse);
      const response = await fetch(server.url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Synthetic render");
    } finally {
      server?.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
