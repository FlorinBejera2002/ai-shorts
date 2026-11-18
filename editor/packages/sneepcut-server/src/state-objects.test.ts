import { expect, test } from "bun:test";
import { S3Client } from "bun";
import { createHash } from "node:crypto";
import { S3StateObjects, verifyStateObjectConditions } from "./state-objects";

test("S3 conditional PUT uses the exact opaque ETag without response-header quotes", async () => {
  let saved: { body: string; etag: string } | undefined;
  const matches: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method === "DELETE") {
        saved = undefined;
        return new Response(null, { status: 204 });
      }
      if (request.method === "PUT") {
        const match = request.headers.get("If-Match");
        if (match !== null) matches.push(match);
        if (
          (request.headers.get("If-None-Match") === "*" && saved) ||
          (match !== null && match !== saved?.etag)
        )
          return new Response(null, { status: 412 });
        const body = await request.text();
        saved = { body, etag: createHash("md5").update(body).digest("hex") };
        return new Response(null, { headers: { ETag: `"${saved.etag}"` } });
      }
      return saved
        ? new Response(saved.body, { headers: { ETag: `"${saved.etag}"` } })
        : new Response(null, { status: 404 });
    },
  });
  try {
    const objects = new S3StateObjects(
      new S3Client({
        endpoint: server.url.origin,
        bucket: "synthetic",
        region: "us-east-1",
        accessKeyId: "synthetic",
        secretAccessKey: "synthetic",
        virtualHostedStyle: false,
      }),
    );
    await verifyStateObjectConditions(objects, "synthetic");
    expect(matches).toEqual(Array(2).fill(createHash("md5").update("first").digest("hex")));
    expect(saved).toBeUndefined();
  } finally {
    server.stop(true);
  }
});
