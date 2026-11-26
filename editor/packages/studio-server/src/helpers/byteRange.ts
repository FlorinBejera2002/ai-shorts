import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

/**
 * Resolves a single `bytes=start-end` Range header against a file size.
 * An absent or unsupported header serves the whole file; a range that starts
 * past the end is unsatisfiable (416).
 */
export type ByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

export function parseByteRange(header: string | undefined, size: number): ByteRange {
  const match = header ? /^bytes=(\d+)-(\d*)$/.exec(header.trim()) : null;
  if (!match) return { kind: "full" };
  const start = parseInt(match[1]!, 10);
  if (start >= size) return { kind: "unsatisfiable" };
  const requestedEnd = match[2] ? parseInt(match[2], 10) : size - 1;
  if (requestedEnd < start) return { kind: "full" };
  return { kind: "partial", start, end: Math.min(requestedEnd, size - 1) };
}

/**
 * Streams a file from disk with HTTP Range support, so `<video>` can seek.
 * Only the requested window is read; the whole file is never buffered.
 */
export function rangeMediaResponse(
  filePath: string,
  rangeHeader: string | undefined,
  headers: Record<string, string>,
): Response {
  const size = statSync(filePath).size;
  const range = parseByteRange(rangeHeader, size);
  const common = { ...headers, "Accept-Ranges": "bytes" };
  if (range.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "Content-Range": `bytes */${size}` },
    });
  }
  // Node's web stream type and the DOM one do not overlap for tsc on every
  // platform's lib set; the double cast is the documented bridge (as in preview.ts).
  if (range.kind === "partial") {
    const body = Readable.toWeb(
      createReadStream(filePath, { start: range.start, end: range.end }),
    ) as unknown as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(body, {
    headers: { ...common, "Content-Length": String(size) },
  });
}
