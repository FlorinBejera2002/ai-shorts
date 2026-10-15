import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileContentVersion } from "@hyperframes/studio-server";
import { createUserRuntime } from "./runtime";
import { ProjectStore } from "./store";
import { withWorkspace } from "./workspace";

test("a browser save queued behind publication resolves the new project generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-composition-test-runtime-"));
  const owner = "11111111-1111-4111-8111-111111111111";
  const id = "22222222-2222-4222-8222-222222222222";
  const store = new ProjectStore(root);
  const runtime = createUserRuntime(owner, store);
  try {
    const source =
      '<!doctype html><html><body><div id="main" data-composition-id="main" data-width="320" data-height="180" data-duration="1">Original</div></body></html>';
    const original = await store.publish(owner, id, "Project", async (project) => {
      await writeFile(join(project.dir, "index.html"), source);
    });
    // Start the old runtime before advancing the private generation pointer.
    expect((await runtime.api.request(`/projects/${id}/files/index.html`)).status).toBe(200);
    let release = () => {};
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const publishing = withWorkspace(owner, id, async () => {
      entered();
      await blocked;
      return store.publish(owner, id, "Next generation", async (project) => {
        await writeFile(join(project.dir, "index.html"), source);
        await writeFile(join(project.dir, "accepted.txt"), "Accepted automatic update");
      });
    });
    await started;
    const changed = source.replace("Original", "Queued manual save");
    const saving = runtime.api.request(`/projects/${id}/files/index.html`, {
      method: "PUT",
      headers: { "Content-Type": "text/html", "If-Match": fileContentVersion(source) },
      body: changed,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const published = await publishing;
    expect((await saving).status).toBe(200);
    expect(await readFile(join(published.dir, "index.html"), "utf8")).toBe(changed);
    expect(await readFile(join(original.dir, "index.html"), "utf8")).toBe(source);
    expect((await store.resolve(owner, id))!.dir).toBe(published.dir);
    expect((await runtime.api.request(`/projects/${id}/files/.sneepcut-project.json`)).status).toBe(
      403,
    );
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
