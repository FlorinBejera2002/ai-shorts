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

/** Keep credentials off signed media requests and never follow redirects. */
export function mediaDownloadURL(
  reference: string,
  publicOrigin: string,
  internalOrigin?: string,
): URL {
  const source = new URL(reference, publicOrigin);
  if (
    source.origin !== new URL(publicOrigin).origin ||
    source.username ||
    source.password ||
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
