import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseByteRange, rangeMediaResponse } from "./byteRange";

describe("parseByteRange", () => {
  it("serves the whole file without a Range header", () => {
    expect(parseByteRange(undefined, 100)).toEqual({ kind: "full" });
  });

  it("resolves a bounded range", () => {
    expect(parseByteRange("bytes=0-1023", 4096)).toEqual({ kind: "partial", start: 0, end: 1023 });
  });

  it("clamps an end past the file and resolves an open-ended range to the last byte", () => {
    expect(parseByteRange("bytes=90-500", 100)).toEqual({ kind: "partial", start: 90, end: 99 });
    expect(parseByteRange("bytes=10-", 100)).toEqual({ kind: "partial", start: 10, end: 99 });
  });

  it("is unsatisfiable when the range starts at or past the end", () => {
    expect(parseByteRange("bytes=100-", 100)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignores a malformed or backwards range and serves the whole file", () => {
    expect(parseByteRange("bytes=5-2", 100)).toEqual({ kind: "full" });
    expect(parseByteRange("items=0-1", 100)).toEqual({ kind: "full" });
  });
});

describe("rangeMediaResponse", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "hf-byte-range-"));
    dirs.push(dir);
    const file = join(dir, "clip.mp4");
    writeFileSync(file, "0123456789");
    return file;
  }

  it("answers a Range request with 206, Content-Range and only that slice", async () => {
    const res = rangeMediaResponse(fixture(), "bytes=2-5", { "Content-Type": "video/mp4" });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(await res.text()).toBe("2345");
  });

  it("serves the full file with 200 when no Range is sent", async () => {
    const res = rangeMediaResponse(fixture(), undefined, { "Content-Type": "video/mp4" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Range")).toBeNull();
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(await res.text()).toBe("0123456789");
  });

  it("answers an out-of-range request with 416 and the file size", () => {
    const res = rangeMediaResponse(fixture(), "bytes=50-", { "Content-Type": "video/mp4" });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */10");
  });
});
