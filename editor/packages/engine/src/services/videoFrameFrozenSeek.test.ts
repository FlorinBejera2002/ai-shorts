import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractVideoFramesRange } from "./videoFrameExtractor.js";
import { extractMediaMetadata, type VideoMetadata } from "../utils/ffprobe.js";
import { runFfmpeg, type RunFfmpegResult } from "../utils/runFfmpeg.js";

vi.mock("../utils/ffprobe.js", () => ({
  extractMediaMetadata: vi.fn(),
  extractFinalVideoFrameTimestamp: vi.fn(),
  extractVideoFrameTimestampAt: vi.fn(),
}));
vi.mock("../utils/runFfmpeg.js", () => ({ runFfmpeg: vi.fn() }));

const metadata: VideoMetadata = {
  durationSeconds: 3600,
  videoStreamDurationSeconds: 3600,
  width: 320,
  height: 180,
  fps: 30,
  videoCodec: "h264",
  hasAudio: false,
  isVFR: false,
  hasAlpha: false,
  colorSpace: null,
};
const success: RunFfmpegResult = {
  success: true,
  exitCode: 0,
  stderr: "",
  durationMs: 1,
  terminationReason: "exit",
};
let directory = "";

beforeEach(() => {
  vi.clearAllMocks();
  const root = resolve(import.meta.dirname, "../../../../../.cache/tmp");
  mkdirSync(root, { recursive: true });
  directory = mkdtempSync(resolve(root, "frozen-seek-"));
  vi.mocked(extractMediaMetadata).mockResolvedValue(metadata);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function writeFrame(args: string[]): Promise<RunFfmpegResult> {
  const pattern = args.at(-1);
  if (!pattern) throw new Error("missing frame destination");
  writeFileSync(pattern.replace("%05d", "00001"), "decoded frame");
  return Promise.resolve(success);
}

function extract(preferInputSeek = true) {
  return extractVideoFramesRange("long-source.mp4", "picture", 3599.966666, 0.000001, {
    outputDir: directory,
    fps: 30,
    finalFrameOnly: true,
    preferInputSeek,
  });
}

describe("frozen picture seek cost and fallback", () => {
  it("decodes a late boundary picture from its seek point", async () => {
    vi.mocked(runFfmpeg).mockImplementation(writeFrame);
    expect((await extract()).totalFrames).toBe(1);
    expect(runFfmpeg).toHaveBeenCalledOnce();
    const args = vi.mocked(runFfmpeg).mock.calls[0]![0];
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args[args.indexOf("-ss") + 1]).toBe("3599.966666");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1");
  });

  it("retries an empty input seek once using the exact output-side timestamp", async () => {
    vi.mocked(runFfmpeg).mockResolvedValueOnce(success).mockImplementationOnce(writeFrame);
    expect((await extract()).totalFrames).toBe(1);
    expect(runFfmpeg).toHaveBeenCalledTimes(2);
    const retry = vi.mocked(runFfmpeg).mock.calls[1]![0];
    expect(retry.indexOf("-ss")).toBeGreaterThan(retry.indexOf("-i"));
    expect(retry[retry.indexOf("-ss") + 1]).toBe("3599.966666");
  });

  it("does not recurse after an empty fallback", async () => {
    vi.mocked(runFfmpeg).mockResolvedValue(success);
    await expect(extract()).rejects.toMatchObject({ kind: "zero_output" });
    expect(runFfmpeg).toHaveBeenCalledTimes(2);
  });

  it("retains output seeking for existing held-tail extraction", async () => {
    vi.mocked(runFfmpeg).mockImplementation(writeFrame);
    expect((await extract(false)).totalFrames).toBe(1);
    const args = vi.mocked(runFfmpeg).mock.calls[0]![0];
    expect(args.indexOf("-ss")).toBeGreaterThan(args.indexOf("-i"));
    expect(runFfmpeg).toHaveBeenCalledOnce();
  });

  it("does not retry an aborted input seek", async () => {
    vi.mocked(runFfmpeg).mockResolvedValue({
      ...success,
      success: false,
      terminationReason: "abort",
    });
    await expect(extract()).rejects.toMatchObject({ kind: "cancelled" });
    expect(runFfmpeg).toHaveBeenCalledOnce();
  });
});
