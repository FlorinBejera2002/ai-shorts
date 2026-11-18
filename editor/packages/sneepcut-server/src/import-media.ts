import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { HTTPException } from "hono/http-exception";
import type { AuthFetcher } from "./auth";

// Leave headroom for project metadata below the isolated renderer's 512 MiB cap.
export const STORY_IMPORT_MAX_BYTES = 500 * 1024 ** 2;

export async function remainingImportBudget(
  dir: string,
  limit = STORY_IMPORT_MAX_BYTES,
): Promise<number> {
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    bytes += entry.isDirectory()
      ? limit - (await remainingImportBudget(path, limit))
      : (await stat(path)).size;
  }
  if (bytes > limit)
    throw new HTTPException(413, {
      message:
        "Editable Story sources and retained exports exceed Studio's 500 MiB project budget. Use smaller source files.",
    });
  return limit - bytes;
}

/** A configured object-store address is an exact HTTP(S) origin, not a prefix. */
export function validateMediaS3Origin(origin?: string): URL | undefined {
  if (!origin) return undefined;
  const parsed = new URL(origin);
  if (
    !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
    parsed.pathname !== "/" || parsed.search || parsed.hash
  ) throw new Error("Invalid S3 composition media origin");
  return parsed;
}

/** Preserve signed S3 addresses; rewrite only validated application media paths. */
export function mediaDownloadURL(
  reference: string,
  publicOrigin: string,
  internalOrigin?: string,
  s3Origin?: string,
): URL {
  const source = new URL(reference, publicOrigin);
  const s3 = validateMediaS3Origin(s3Origin);
  if (s3 && source.origin === s3.origin && !source.username && !source.password && !source.hash)
    return source;
  if (
    source.origin !== new URL(publicOrigin).origin ||
    source.username ||
    source.password ||
    source.hash ||
    !source.pathname.startsWith("/media/")
  ) {
    throw new HTTPException(422, { message: "The clip storage address is not supported." });
  }
  if (!internalOrigin) return source;
  const target = new URL(internalOrigin);
  target.pathname = source.pathname;
  target.search = source.search;
  return target;
}

/** Change transport only; SigV4 still authenticates the original Host and query. */
export function createMediaFetcher(fetcher: AuthFetcher, s3Origin?: string, internalS3Origin?: string): AuthFetcher {
  const publicS3 = validateMediaS3Origin(s3Origin);
  const internalS3 = validateMediaS3Origin(internalS3Origin);
  if (internalS3 && !publicS3) throw new Error("An internal S3 transport requires its public origin");
  return (input, init) => {
    const source = new URL(input instanceof Request ? input.url : input);
    if (!internalS3 || source.origin !== publicS3?.origin) return fetcher(input, init);
    if (source.username || source.password || source.hash) throw new Error("Invalid signed media address");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.has("Authorization") || headers.has("Cookie")) throw new Error("Credentials cannot be forwarded to signed media");
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (!["GET", "HEAD"].includes(method.toUpperCase())) throw new Error("Signed media transport is read-only");
    const target = new URL(internalS3.origin);
    target.pathname = source.pathname;
    target.search = source.search;
    headers.set("Host", source.host);
    return fetcher(target, { ...init, method, headers, redirect: "error",
      signal: init?.signal ?? (input instanceof Request ? input.signal : undefined) });
  };
}

export async function downloadImportFile(
  fetcher: AuthFetcher,
  url: URL,
  destination: string,
  maxBytes: number,
  bearer?: string,
) {
  const response = await fetcher(url, {
    ...(bearer ? { headers: { Authorization: bearer } } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok || !response.body)
    throw new HTTPException(502, {
      message: "Could not retrieve a project source. Please try again.",
    });
  if (Number(response.headers.get("Content-Length")) > maxBytes) {
    await response.body.cancel();
    throw new HTTPException(413, {
      message:
        "This source exceeds the remaining Studio import budget (500 MiB per editable Story project). Use smaller source files.",
    });
  }
  const output = await open(destination, "wx");
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes)
        throw new HTTPException(413, {
          message:
            "This source exceeds the remaining Studio import budget (500 MiB per editable Story project). Use smaller source files.",
        });
      await output.writeFile(part.value);
    }
    if (!bytes) throw new Error("Empty project source");
    return bytes;
  } finally {
    await reader.cancel();
    await output.close();
  }
}
