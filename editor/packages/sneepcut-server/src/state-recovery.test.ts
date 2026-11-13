import { afterEach, expect, test } from "bun:test";
import { S3Client } from "bun";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, type Socket } from "node:net";
import { ObjectProjectStore } from "./object-project-store";
import { S3StateObjects, StateConflict } from "./state-objects";
import { retryAfterMs, StateStorageUnavailable } from "./state-object-recovery";

interface Saved {
  bytes: Uint8Array;
  etag: string;
}
const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function fixture() {
  const saved = new Map<string, Saved>();
  const requests: { method: string; key: string; match: string | null }[] = [];
  let fault: (request: Request, key: string) => Promise<Response | undefined> = async () =>
    undefined;
  const commit = async (request: Request, key: string) => {
    const previous = saved.get(key);
    const match = request.headers.get("If-Match");
    if (
      (request.headers.has("If-None-Match") && previous) ||
      (match !== null && match !== previous?.etag.replaceAll('"', ""))
    )
      return new Response(null, { status: 412 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const etag = `"${createHash("md5").update(bytes).digest("hex")}"`;
    saved.set(key, { bytes, etag });
    return new Response(null, { headers: { ETag: etag } });
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const key = decodeURIComponent(new URL(request.url).pathname.slice("/synthetic/".length));
      requests.push({ method: request.method, key, match: request.headers.get("If-Match") });
      const failed = await fault(request, key);
      if (failed) return failed;
      if (request.method === "PUT") return commit(request, key);
      if (request.method === "DELETE") {
        saved.delete(key);
        return new Response(null, { status: 204 });
      }
      const value = saved.get(key);
      if (!value) return new Response(null, { status: 404 });
      const match = request.headers.get("If-Match");
      if (match && match !== value.etag) return new Response(null, { status: 412 });
      const range = request.headers.get("Range");
      const offset = range ? Number(range.slice(6, -1)) : 0;
      const headers = new Headers({
        ETag: value.etag,
        "Content-Length": String(value.bytes.length - offset),
      });
      if (range)
        headers.set(
          "Content-Range",
          `bytes ${offset}-${value.bytes.length - 1}/${value.bytes.length}`,
        );
      return new Response(Buffer.from(value.bytes.slice(offset)), {
        status: range ? 206 : 200,
        headers,
      });
    },
  });
  cleanups.push(() => server.stop(true));
  const client = new S3Client({
    endpoint: server.url.origin,
    bucket: "synthetic",
    region: "us-east-1",
    accessKeyId: "synthetic",
    secretAccessKey: "synthetic",
    virtualHostedStyle: false,
  });
  const objects = new S3StateObjects(client, {
    baseDelayMs: 1,
    timeoutMs: 2000,
    attemptTimeoutMs: 200,
  });
  return {
    objects,
    saved,
    requests,
    commit,
    client,
    setFault(callback: typeof fault) {
      fault = callback;
    },
  };
}

test("temporary failures retry; authorization and immediate conditional conflicts do not", async () => {
  const f = fixture();
  let failures = 2;
  f.setFault(async () => (failures-- > 0 ? new Response(null, { status: 503 }) : undefined));
  expect(await f.objects.get("missing")).toBeNull();
  expect(f.requests).toHaveLength(3);
  f.setFault(async () => new Response(null, { status: 403 }));
  await expect(f.objects.get("private")).rejects.toThrow("403");
  expect(f.requests).toHaveLength(4);
  f.setFault(async () => undefined);
  await f.objects.put("head", "first", null);
  await expect(f.objects.put("head", "first", null)).rejects.toBeInstanceOf(StateConflict);
  expect(f.requests.filter((r) => r.key === "head" && r.method === "GET")).toHaveLength(0);
});

test("a committed PUT with a lost acknowledgement is reconciled without replay", async () => {
  const f = fixture();
  f.setFault(async (request, key) => {
    if (request.method !== "PUT") return;
    await f.commit(request, key);
    return new Response(null, { status: 504 });
  });
  const etag = await f.objects.put("head", JSON.stringify({ revision: randomUUID() }), null);
  expect(etag).toBe(f.saved.get("head")!.etag);
  expect(f.requests.map((r) => r.method)).toEqual(["PUT", "GET"]);
});

test("uncommitted writes retry with their original precondition and streamed Blob bytes", async () => {
  const f = fixture();
  const etag = await f.objects.put("head", "old", null);
  let fail = true;
  f.setFault(async (request) => {
    if (request.method !== "PUT" || !fail) return;
    fail = false;
    await request.arrayBuffer();
    return new Response(null, { status: 503 });
  });
  const bytes = new Blob([new Uint8Array(1024 * 1024 + 17).fill(42)]);
  await f.objects.put("head", bytes, etag);
  expect(f.saved.get("head")!.bytes).toEqual(new Uint8Array(await bytes.arrayBuffer()));
  expect(f.requests.filter((r) => r.method === "PUT").map((r) => r.match)).toEqual([
    null,
    etag.replaceAll('"', ""),
    etag.replaceAll('"', ""),
  ]);
});

test("a retry's 412 is reconciled after the first committed response and readback were lost", async () => {
  const f = fixture();
  let failedRead = false;
  f.setFault(async (request, key) => {
    if (request.method === "PUT") {
      const result = await f.commit(request, key);
      return result.status === 412 ? result : new Response(null, { status: 504 });
    }
    if (!failedRead) {
      failedRead = true;
      return new Response(null, { status: 503 });
    }
  });
  expect(await f.objects.put("head", JSON.stringify({ revision: randomUUID() }), null)).toBe(
    f.saved.get("head")!.etag,
  );
  expect(f.requests.map((r) => r.method)).toEqual(["PUT", "GET", "PUT", "GET"]);
});

test("a competing revision after an uncertain PUT remains a conflict", async () => {
  const f = fixture();
  const etag = await f.objects.put("head", "base", null);
  f.setFault(async (request) => {
    if (request.method !== "PUT") return;
    f.saved.set("head", { bytes: new TextEncoder().encode("other writer"), etag: '"other"' });
    return new Response(null, { status: 504 });
  });
  await expect(f.objects.put("head", "our write", etag)).rejects.toBeInstanceOf(StateConflict);
  expect(f.requests.filter((r) => r.method === "PUT")).toHaveLength(2);
  expect(new TextDecoder().decode(f.saved.get("head")!.bytes)).toBe("other writer");
});

test("temporary failures exhaust a bounded budget and respect Retry-After", async () => {
  const f = fixture();
  f.setFault(async (request) =>
    request.method === "PUT" ? new Response(null, { status: 503 }) : undefined,
  );
  await expect(f.objects.put("head", "unsaved", null)).rejects.toBeInstanceOf(
    StateStorageUnavailable,
  );
  expect(f.requests.filter((r) => r.method === "PUT")).toHaveLength(3);
  expect(f.saved.has("head")).toBe(false);
  f.requests.length = 0;
  f.setFault(async () => new Response(null, { status: 429, headers: { "Retry-After": "3600" } }));
  await expect(f.objects.get("head")).rejects.toBeInstanceOf(StateStorageUnavailable);
  expect(f.requests).toHaveLength(1);
  expect(retryAfterMs("2")).toBe(2000);
  expect(retryAfterMs("invalid")).toBe(0);
});

test("timeout after commit can reconcile with a fresh bounded read", async () => {
  const f = fixture();
  f.setFault(async (request, key) => {
    if (request.method !== "PUT") return;
    await f.commit(request, key);
    await Bun.sleep(100);
    return new Response(null);
  });
  const objects = new S3StateObjects(f.client, {
    timeoutMs: 1000,
    attemptTimeoutMs: 20,
    baseDelayMs: 1,
  });
  const etag = await objects.put("head", "committed", null);
  expect(etag).toBe(f.saved.get("head")!.etag);
  expect(f.requests.filter((r) => r.method === "PUT")).toHaveLength(1);
});

async function interruptedFixture(mode: "same" | "changed" | "bad-range" | "hang") {
  let failures = 1;
  const ranges: (string | undefined)[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.once("data", (data) => {
      const request = new Headers(
        data
          .toString()
          .split("\r\n")
          .slice(1)
          .filter((line) => line.includes(":"))
          .map((line): [string, string] => [
            line.slice(0, line.indexOf(":")),
            line.slice(line.indexOf(":") + 1).trim(),
          ]),
      );
      ranges.push(request.get("range") ?? undefined);
      const send = (status: string, body: string, headers = "") =>
        socket.end(
          `HTTP/1.1 ${status}\r\nConnection: close\r\n${headers}Content-Length: ${body.length}\r\n\r\n${body}`,
        );
      if (failures-- > 0) {
        socket.write(
          'HTTP/1.1 200 OK\r\nETag: "original"\r\nContent-Length: 10\r\nConnection: close\r\n\r\n012',
        );
        if (mode !== "hang") setTimeout(() => socket.destroy(), 10);
      } else if (mode === "changed") {
        send("412 Precondition Failed", "");
      } else {
        if (request.has("range")) {
          expect(request.get("if-match")).toBe('"original"');
          send(
            "206 Partial Content",
            "3456789",
            `ETag: "original"\r\nContent-Range: ${mode === "bad-range" ? "bytes 2-9/10" : "bytes 3-9/10"}\r\n`,
          );
        } else {
          send("200 OK", "0123456789", 'ETag: "original"\r\n');
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  const objects = new S3StateObjects(
    new S3Client({
      endpoint: `http://127.0.0.1:${address.port}`,
      bucket: "synthetic",
      region: "us-east-1",
      accessKeyId: "synthetic",
      secretAccessKey: "synthetic",
      virtualHostedStyle: false,
    }),
    { baseDelayMs: 1, timeoutMs: 1000, attemptTimeoutMs: 200 },
  );
  return {
    objects,
    ranges,
    reset() {
      failures = 1;
    },
  };
}

test("interrupted metadata bodies restart; streamed files resume at the original ETag", async () => {
  const f = await interruptedFixture("same");
  expect(new TextDecoder().decode((await f.objects.get("blob"))!.bytes)).toBe("0123456789");
  f.reset();
  const response = await f.objects.read("blob");
  expect(await response.text()).toBe("0123456789");
  expect(f.ranges.at(-1)).toBe("bytes=3-");
});

test("resuming a download rejects changed revisions and malformed range responses", async () => {
  for (const mode of ["changed", "bad-range"] as const) {
    const f = await interruptedFixture(mode);
    await expect((await f.objects.read("blob")).text()).rejects.toThrow();
  }
});

test("cancelling an in-flight stream aborts the read without opening recovery requests", async () => {
  const f = await interruptedFixture("hang");
  const reader = (await f.objects.read("blob")).body!.getReader();
  expect((await reader.read()).value).toEqual(new TextEncoder().encode("012"));
  await Promise.race([
    reader.cancel(),
    Bun.sleep(200).then(() => {
      throw new Error("Stream cancellation did not abort the network read");
    }),
  ]);
  expect(f.ranges).toHaveLength(1);
});

test("a Studio save survives lost head acknowledgement and is restored on another server", async () => {
  const f = fixture();
  const scratch = join(import.meta.dir, "../../../../.cache/tmp");
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "s3-recovery-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const owner = randomUUID(),
    id = randomUUID();
  const a = new ObjectProjectStore(join(root, "a"), f.objects, "editable");
  const project = await a.ensure(owner, id, "Recovery", (p) =>
    writeFile(join(p.dir, "index.html"), "before"),
  );
  f.setFault(async (request, key) => {
    if (request.method !== "PUT" || !key.includes("/heads/")) return;
    await f.commit(request, key);
    return new Response(null, { status: 504 });
  });
  await writeFile(join(project.dir, "index.html"), "after");
  await a.save(owner, id);
  const b = new ObjectProjectStore(join(root, "b"), f.objects, "editable");
  const restored = (await b.resolve(owner, id))!;
  expect(await readFile(join(restored.dir, "index.html"), "utf8")).toBe("after");
  expect(b.version(owner, id)).toBe(a.version(owner, id));
});

test("native listings retry service failures and retain every pagination result", async () => {
  const f = fixture();
  let failures = 1,
    page = 0;
  f.setFault(async (request) => {
    if (!new URL(request.url).searchParams.has("list-type")) return;
    if (failures-- > 0)
      return new Response("<Error><Code>SlowDown</Code><Message>synthetic</Message></Error>", {
        status: 503,
        headers: { "Content-Type": "application/xml" },
      });
    page++;
    return new Response(
      `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>${page < 4}</IsTruncated><Contents><Key>prefix/${page}</Key><Size>1</Size></Contents>${page < 4 ? `<NextContinuationToken>${page}</NextContinuationToken>` : ""}</ListBucketResult>`,
      { headers: { "Content-Type": "application/xml" } },
    );
  });
  expect(await f.objects.list("prefix/")).toEqual(["prefix/1", "prefix/2", "prefix/3", "prefix/4"]);
  expect(f.requests).toHaveLength(5);
});

test("idempotent deletion retries and missing metadata never acknowledges a write", async () => {
  const f = fixture();
  await f.objects.put("blob", "saved", null);
  let failures = 1;
  f.setFault(async (request, key) => {
    if (request.method === "DELETE" && failures-- > 0) {
      f.saved.delete(key);
      return new Response(null, { status: 504 });
    }
  });
  await f.objects.delete("blob");
  expect(f.saved.has("blob")).toBe(false);
  expect(f.requests.filter((r) => r.method === "DELETE")).toHaveLength(2);
  f.setFault(async (request, key) => {
    if (request.method === "PUT") {
      await f.commit(request, key);
      return new Response(null); // Successful write, acknowledgement lacks ETag.
    }
  });
  expect(await f.objects.put("blob", "new bytes", null)).toBe(f.saved.get("blob")!.etag);
});

test("persistent read timeouts stop at the attempt limit", async () => {
  const f = fixture();
  f.setFault(async () => {
    await Bun.sleep(30);
    return new Response(null, { status: 404 });
  });
  const objects = new S3StateObjects(f.client, {
    timeoutMs: 200,
    attemptTimeoutMs: 5,
    baseDelayMs: 1,
  });
  await expect(objects.get("head")).rejects.toBeInstanceOf(StateStorageUnavailable);
  expect(f.requests).toHaveLength(3);
});
