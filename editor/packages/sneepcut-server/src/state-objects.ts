import { S3Client } from "bun";
import { HTTPException } from "hono/http-exception";
import { createHash, randomUUID } from "node:crypto";
import {
  StateObjectRecovery,
  TemporaryStorageError,
  retryAfterMs,
  type RecoveryPolicy,
} from "./state-object-recovery";

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
  constructor(
    private readonly client: S3Client,
    private readonly recoveryPolicy: Partial<RecoveryPolicy> = {},
  ) {}
  private recovery() {
    return new StateObjectRecovery(this.recoveryPolicy);
  }
  private async request(
    key: string,
    method: "GET" | "PUT" | "DELETE",
    signal: AbortSignal,
    init?: RequestInit,
  ) {
    // Bun signs the private server endpoint directly. No browser URL, redirect or public ACL.
    const url = this.client.presign(key, { method, expiresIn: 300 });
    let response: Response;
    try {
      response = await fetch(url, { ...init, method, redirect: "error", signal });
    } catch {
      // Do not expose signed URLs or provider error bodies to logs or clients.
      throw new TemporaryStorageError();
    }
    if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
      await response.body?.cancel();
      throw new TemporaryStorageError(retryAfterMs(response.headers.get("Retry-After")));
    }
    if (response.status === 409 || response.status === 412) {
      await response.body?.cancel();
      throw new StateConflict();
    }
    if (!response.ok && !(response.status === 404 && method !== "PUT")) {
      await response.body?.cancel();
      throw new Error(`Studio object storage ${method} failed (${response.status})`);
    }
    return response;
  }
  async get(key: string): Promise<StateObject | null> {
    return this.recovery().run(async (signal) => {
      const response = await this.request(key, "GET", signal);
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      const etag = response.headers.get("ETag");
      if (!etag) {
        await response.body?.cancel();
        throw new Error("Studio object storage did not return an ETag");
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of bodyChunks(response)) {
        size += chunk.length;
        if (size > 32 * 1024 ** 2) throw new Error("Studio state metadata is too large");
        chunks.push(chunk);
      }
      const length = response.headers.get("Content-Length");
      if (length !== null && size !== Number(length)) throw new TemporaryStorageError();
      return { bytes: new Uint8Array(Buffer.concat(chunks)), etag };
    });
  }
  async read(key: string) {
    const recovery = this.recovery();
    const cancellation = new AbortController();
    let response = await recovery.run(
      (signal) => this.request(key, "GET", AbortSignal.any([signal, cancellation.signal])),
      true,
    );
    if (response.status === 404) return response;
    const etag = response.headers.get("ETag");
    const length = response.headers.get("Content-Length");
    if (!etag || length === null || !/^\d+$/.test(length)) {
      await response.body?.cancel();
      throw new Error("Studio object storage did not return stream metadata");
    }
    const total = Number(length);
    const originalETag = etag;
    const initial = response;
    const resume = (signal: AbortSignal, offset: number) =>
      this.request(key, "GET", AbortSignal.any([signal, cancellation.signal]), {
        headers: { Range: `bytes=${offset}-`, "If-Match": originalETag },
      });
    async function* stream() {
      let offset = 0;
      while (true) {
        try {
          for await (const chunk of bodyChunks(response)) {
            offset += chunk.length;
            if (offset > total) throw new Error("Studio object storage returned too many bytes");
            yield chunk;
          }
          if (offset !== total) throw new TemporaryStorageError();
          return;
        } catch (error) {
          if (cancellation.signal.aborted) return;
          if (!(error instanceof TemporaryStorageError)) throw error;
          response = await recovery.run(async (signal) => {
            const next = await resume(signal, offset);
            if (
              next.status !== 206 ||
              next.headers.get("ETag") !== etag ||
              next.headers.get("Content-Range") !== `bytes ${offset}-${total - 1}/${total}`
            ) {
              await next.body?.cancel();
              throw new Error("Studio object storage could not safely resume the read");
            }
            return next;
          }, true);
        }
      }
    }
    const iterator = stream();
    return new Response(
      new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await iterator.next();
            if (next.done) controller.close();
            else controller.enqueue(next.value);
          } catch (error) {
            controller.error(error);
          }
        },
        async cancel() {
          cancellation.abort();
          await iterator.return();
        },
      }),
      { status: initial.status, headers: initial.headers },
    );
  }
  async put(key: string, body: string | Blob, expected: string | null): Promise<string> {
    // S3 conditional PUT expects the opaque ETag value. Hetzner rejects the
    // HTTP quotes returned by GET/PUT responses; retain the exact value inside.
    const recovery = this.recovery();
    let uncertain = false;
    let digest: Promise<string> | undefined;
    return recovery.run(
      async (signal) => {
        try {
          const response = await this.request(key, "PUT", signal, {
            body,
            headers:
              expected === null
                ? { "If-None-Match": "*" }
                : { "If-Match": expected.replace(/^"([^"]+)"$/, "$1") },
          });
          const etag = response.headers.get("ETag");
          await response.body?.cancel();
          if (!etag) throw new TemporaryStorageError();
          return etag;
        } catch (error) {
          if (error instanceof TemporaryStorageError) {
            uncertain = true;
            await recovery.waitForProvider(error.retryAfterMs);
          } else if (!(error instanceof StateConflict && uncertain)) throw error;
          // Compare the full payload, never infer success from existence or an ETag
          // hash. Project heads contain a unique revision; blobs are immutable.
          const check = await this.request(key, "GET", recovery.signal(true));
          if (check.status !== 404) {
            const etag = check.headers.get("ETag");
            if (!etag) {
              await check.body?.cancel();
              throw new TemporaryStorageError();
            }
            const size = typeof body === "string" ? Buffer.byteLength(body) : body.size;
            const length = check.headers.get("Content-Length");
            if (length !== null && Number(length) !== size) {
              await check.body?.cancel();
              if (etag !== expected) throw new StateConflict();
              throw error;
            }
            const actual = await hashChunks(bodyChunks(check), size);
            digest ??= hashChunks(
              typeof body === "string" ? [new TextEncoder().encode(body)] : body.stream(),
            );
            if (etag && actual === (await digest)) return etag;
            if (etag !== expected) throw new StateConflict();
          } else await check.body?.cancel();
          throw error;
        }
      },
      typeof body !== "string",
    );
  }
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    const recovery = this.recovery();
    let token: string | undefined;
    do {
      const page = await recovery.nextRequest().run(async (signal) => {
        try {
          return await abortableListing(
            this.client.list({ prefix, continuationToken: token, maxKeys: 1000 }),
            signal,
          );
        } catch (error) {
          if (error instanceof TemporaryStorageError || temporaryListingError(error))
            throw new TemporaryStorageError();
          throw error;
        }
      });
      for (const item of page.contents ?? []) if (item.key) keys.push(item.key);
      token = page.isTruncated ? page.nextContinuationToken : undefined;
      if (page.isTruncated && !token) throw new Error("Incomplete Studio object listing");
    } while (token);
    return keys;
  }
  async delete(key: string) {
    await this.recovery().run(async (signal) => {
      const response = await this.request(key, "DELETE", signal);
      await response.body?.cancel();
    });
  }
}

async function* bodyChunks(response: Response): AsyncGenerator<Uint8Array> {
  if (!response.body) throw new TemporaryStorageError();
  const reader = response.body.getReader();
  try {
    while (true) {
      let next: Awaited<ReturnType<typeof reader.read>>;
      try {
        next = await reader.read();
      } catch {
        throw new TemporaryStorageError();
      }
      if (next.done) return;
      yield next.value;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function hashChunks(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  maxBytes = Infinity,
) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Studio object storage returned too many bytes");
    hash.update(chunk);
  }
  if (maxBytes !== Infinity && size !== maxBytes) throw new TemporaryStorageError();
  return hash.digest("hex");
}

async function abortableListing<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      operation.catch(() => {});
      reject(new TemporaryStorageError());
      return;
    }
    const aborted = () => reject(new TemporaryStorageError());
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function temporaryListingError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (
    ["code", "name"].some((field) =>
      [
        "SlowDown",
        "ServiceUnavailable",
        "InternalError",
        "RequestTimeout",
        "ECONNRESET",
        "ConnectionClosed",
      ].includes(Reflect.get(error, field)),
    ) || [408, 429, 500, 502, 503, 504].includes(Reflect.get(error, "statusCode"))
  );
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
