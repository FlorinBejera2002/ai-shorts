import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClipImporter, openEmptyWorkspace } from "./clip-import";
import { ProjectStore } from "./store";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
let root: string;
let store: ProjectStore;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "studio-import-"));
  store = new ProjectStore(root);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const clip = () => ({
  id,
  user_id: alice,
  title: "A <generated> clip",
  duration: 4.5,
  aspect_ratio: "9:16",
  file_url: "https://app.test/media/clips/test.mp4?sig=synthetic",
});

test("imports an owned generated clip once and preserves the editable copy", async () => {
  let downloads = 0;
  const importer = createClipImporter({
    store,
    apiOrigin: "https://api.test",
    mediaOrigin: "https://app.test",
    probeAudio: async () => true,
    fetcher: async (input, init) => {
      expect(init?.redirect).toBe("error");
      if (String(input).includes("/api/clips/")) {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer alice");
        return Response.json(clip());
      }
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      downloads++;
      return new Response("synthetic-video");
    },
  });
  const [first, second] = await Promise.all([
    importer(alice, "Bearer alice", id),
    importer(alice, "Bearer alice", id),
  ]);
  expect(first.id).toBe(second.id);
  expect(downloads).toBe(1);
  expect(await readFile(join(first.dir, "assets/clip.mp4"), "utf8")).toBe("synthetic-video");
  const html = await readFile(join(first.dir, "index.html"), "utf8");
  expect(html).toContain('data-width="1080" data-height="1920" data-duration="4.5"');
  expect(html).toContain('src="assets/clip.mp4"');
  expect(html).toContain("A &lt;generated&gt; clip");
  await writeFile(join(first.dir, "index.html"), "saved edit");
  await importer(alice, "Bearer alice", id);
  expect(await readFile(join(first.dir, "index.html"), "utf8")).toBe("saved edit");
  expect(downloads).toBe(1);
  expect(await store.list(bob)).toHaveLength(0);
});

test("rejects other users and arbitrary media destinations before downloading", async () => {
  for (const changed of [
    { user_id: bob },
    { file_url: "http://169.254.169.254/media/token" },
    { file_url: "https://app.test/private" },
    { duration: 0 },
  ]) {
    let calls = 0;
    const importer = createClipImporter({
      store,
      apiOrigin: "https://api.test",
      mediaOrigin: "https://app.test",
      probeAudio: async () => true,
      fetcher: async () => {
        calls++;
        return Response.json({ ...clip(), ...changed });
      },
    });
    await expect(importer(alice, "Bearer alice", id)).rejects.toThrow();
    expect(calls).toBe(1);
    expect(await store.list(alice)).toHaveLength(0);
  }
});

test("failed download never leaves a visible project and can be retried", async () => {
  let fail = true;
  const importer = createClipImporter({
    store,
    apiOrigin: "https://api.test",
    mediaOrigin: "https://app.test",
    probeAudio: async () => true,
    fetcher: async (input) =>
      String(input).includes("/api/clips/")
        ? Response.json(clip())
        : fail
          ? new Response(null, { status: 503 })
          : new Response("video"),
  });
  await expect(importer(alice, "Bearer alice", id)).rejects.toThrow();
  expect(await store.list(alice)).toHaveLength(0);
  fail = false;
  await importer(alice, "Bearer alice", id);
  expect(await store.list(alice)).toHaveLength(1);
});

test("opening Studio directly reuses one private blank workspace", async () => {
  const [first, second] = await Promise.all([
    openEmptyWorkspace(store, alice),
    openEmptyWorkspace(store, alice),
  ]);
  expect(first.id).toBe(second.id);
  expect(await store.list(alice)).toHaveLength(1);
  expect(await store.list(bob)).toHaveLength(0);
  expect(await readFile(join(first.dir, "index.html"), "utf8")).not.toContain("title-card");
});
