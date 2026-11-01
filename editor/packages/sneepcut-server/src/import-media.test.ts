import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMediaFetcher, mediaDownloadURL, remainingImportBudget } from "./import-media";

test("internal S3 transport preserves signed host/path/query without forwarding credentials", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const fetcher = createMediaFetcher(async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    expect(init?.redirect).toBe("error");
    return new Response("media");
  }, "http://s3.localhost:8333", "http://seaweedfs:8333");
  await fetcher("http://s3.localhost:8333/bucket/a%20clip.mp4?X-Amz-Signature=abc&part=1");
  expect(calls[0].url).toBe("http://seaweedfs:8333/bucket/a%20clip.mp4?X-Amz-Signature=abc&part=1");
  expect(calls[0].headers.get("Host")).toBe("s3.localhost:8333");
  expect(calls[0].headers.has("Authorization")).toBe(false);
  for (const headers of [new Headers({ Authorization: "Bearer secret" }), new Headers({ Cookie: "session=secret" })])
    expect(() => fetcher("http://s3.localhost:8333/bucket/a.mp4", { headers })).toThrow("Credentials");
  expect(calls).toHaveLength(1);
  expect(() => createMediaFetcher(fetch, undefined, "http://seaweedfs:8333")).toThrow();
});

test("signed S3 downloads preserve the exact trusted origin and query", () => {
  const signed = "https://bucket.storage.test/uploads/clip.mp4?X-Amz-Signature=secret&X-Amz-Expires=60";
  expect(String(mediaDownloadURL(signed, "https://app.test", "http://nginx", "https://bucket.storage.test"))).toBe(signed);
  expect(String(mediaDownloadURL("/media/clip.mp4?sig=local", "https://app.test", "http://nginx", "https://bucket.storage.test")))
    .toBe("http://nginx/media/clip.mp4?sig=local");
  for (const reference of [
    "https://bucket.storage.test.evil.test/file", "https://bucket.storage.test:444/file",
    "https://user:pass@bucket.storage.test/file", "https://bucket.storage.test/file#fragment",
    "http://169.254.169.254/file",
  ]) expect(() => mediaDownloadURL(reference, "https://app.test", "http://nginx", "https://bucket.storage.test")).toThrow();
  expect(() => mediaDownloadURL(signed, "https://app.test")).toThrow();
  for (const origin of ["file:///tmp", "https://bucket.storage.test/path", "https://user@bucket.storage.test", "https://bucket.storage.test?query=1"])
    expect(() => mediaDownloadURL(signed, "https://app.test", undefined, origin)).toThrow();
});

test("counts retained originals and every source once against the render-safe project budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "story-budget-"));
  try {
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets/source-1.mp4"), new Uint8Array(4));
    await writeFile(join(dir, "assets/original-export.mp4"), new Uint8Array(3));
    await writeFile(join(dir, "index.html"), "x");
    expect(await remainingImportBudget(dir, 10)).toBe(2);
    await writeFile(join(dir, "assets/original-source-1.mov"), new Uint8Array(4));
    await expect(remainingImportBudget(dir, 10)).rejects.toThrow("500 MiB project budget");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
