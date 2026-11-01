import { S3Client } from "bun";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";

export interface StateObject {
  bytes: Uint8Array;
  etag: string;
}
/** Small metadata uses conditional PUT; large immutable files can stream from disk. */
export interface StateObjects {
  get(key: string): Promise<StateObject | null>;
  read(key: string): Promise<Response>;
  put(key: string, body: string | Blob, expected: string | null): Promise<string>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export class StateConflict extends HTTPException {
  constructor() {
    super(409, {
      message: "Studio state changed on another server. Reopen the project and retry.",
    });
  }
}

export class S3StateObjects implements StateObjects {
  constructor(private readonly client: S3Client) {}
  private async request(key: string, method: "GET" | "PUT" | "DELETE", init?: RequestInit) {
    // Bun signs the private server endpoint directly. No browser URL, redirect or public ACL.
    const response = await fetch(this.client.presign(key, { method, expiresIn: 300 }), {
      ...init,
      method,
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 409 || response.status === 412) {
      await response.body?.cancel();
      throw new StateConflict();
    }
    if (!response.ok && response.status !== 404) {
      await response.body?.cancel();
      throw new Error(`Studio object storage ${method} failed (${response.status})`);
    }
    return response;
  }
  async get(key: string): Promise<StateObject | null> {
    const response = await this.request(key, "GET");
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    const etag = response.headers.get("ETag");
    if (!etag) throw new Error("Studio object storage did not return an ETag");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body!) {
      size += chunk.length;
      if (size > 32 * 1024 ** 2) throw new Error("Studio state metadata is too large");
      chunks.push(chunk);
    }
    return { bytes: new Uint8Array(Buffer.concat(chunks)), etag };
  }
  read(key: string) {
    return this.request(key, "GET");
  }
  async put(key: string, body: string | Blob, expected: string | null): Promise<string> {
    const response = await this.request(key, "PUT", {
      body,
      headers: expected === null ? { "If-None-Match": "*" } : { "If-Match": expected },
    });
    const etag = response.headers.get("ETag");
    if (!etag) throw new Error("Studio object storage did not acknowledge the revision");
    return etag;
  }
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.list({ prefix, continuationToken: token, maxKeys: 1000 });
      for (const item of page.contents ?? []) if (item.key) keys.push(item.key);
      token = page.isTruncated ? page.nextContinuationToken : undefined;
      if (page.isTruncated && !token) throw new Error("Incomplete Studio object listing");
    } while (token);
    return keys;
  }
  async delete(key: string) {
    await this.request(key, "DELETE");
  }
}

export function studioStateObjects(env: NodeJS.ProcessEnv = process.env): StateObjects | undefined {
  const mode = env.SNEEPCUT_STUDIO_STORAGE || "local";
  if (mode === "local") return;
  if (mode !== "s3") throw new Error("SNEEPCUT_STUDIO_STORAGE must be local or s3");
  const endpoint = env.SNEEPCUT_STUDIO_S3_ENDPOINT || env.AWS_ENDPOINT_URL;
  for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET", "AWS_REGION"])
    if (!env[key]?.trim()) throw new Error(`Studio S3 requires ${key}`);
  if (endpoint) {
    const url = new URL(endpoint);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid Studio S3 endpoint");
  }
  // Path-style is also supported by Hetzner. Use the same bucket/credentials as media,
  // with a separate private prefix; the internal override avoids *.localhost in Bun.
  return new S3StateObjects(
    new S3Client({
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      sessionToken: env.AWS_SESSION_TOKEN || undefined,
      region: env.AWS_REGION,
      bucket: env.AWS_S3_BUCKET,
      endpoint,
      virtualHostedStyle: false,
    }),
  );
}

/** Fail closed on a provider that ignores either conditional-write header. */
export async function verifyStateObjectConditions(objects: StateObjects, prefix: string) {
  const key = `${prefix}/probes/${randomUUID()}`;
  async function mustConflict(operation: () => Promise<unknown>) {
    try {
      await operation();
    } catch (error) {
      if (error instanceof StateConflict) return;
      throw error;
    }
    throw new Error("Studio object storage does not enforce conditional writes");
  }
  try {
    const first = await objects.put(key, "first", null);
    await mustConflict(() => objects.put(key, "duplicate", null));
    await objects.put(key, "second", first);
    await mustConflict(() => objects.put(key, "stale", first));
    const saved = await objects.get(key);
    if (!saved || new TextDecoder().decode(saved.bytes) !== "second")
      throw new Error("Studio object storage did not preserve the accepted revision");
  } finally {
    await objects.delete(key);
  }
}
