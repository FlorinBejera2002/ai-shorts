import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireMediaProcess,
  acquireStreamingEncoder,
  boundedFfmpegArgs,
  boundedFfprobeArgs,
  mapMediaWork,
  MediaProcessLimiter,
  renderResourceLimits,
} from "./renderResources.js";

afterEach(() => vi.unstubAllEnvs());

describe("render CPU budget", () => {
  it("uses container quota and explicit sandbox budget instead of host cores", () => {
    expect(renderResourceLimits({ cpuCount: 64, quota: 2, configuredCpu: "8" })).toMatchObject({
      cpuCount: 2,
      mediaConcurrency: 1,
      ffmpegThreads: 2,
      captureWorkers: 1,
    });
    expect(renderResourceLimits({ cpuCount: 64, quota: 4, configuredCpu: "1" })).toMatchObject({
      cpuCount: 1,
      mediaConcurrency: 1,
      ffmpegThreads: 1,
      captureWorkers: 1,
    });
  });

  it("fails conservatively for malformed and fractional deployment budgets", () => {
    for (const configuredCpu of ["invalid", "0", "-1", "0.5"])
      expect(renderResourceLimits({ cpuCount: 64, quota: 64, configuredCpu }).cpuCount).toBe(1);
  });
});

describe("media process arguments", () => {
  it.each([
    "-i",
    "-threads",
    "-threads:v",
    "-filter_threads",
    "-filter_complex_threads",
    "-x265-params",
  ])("rejects a missing %s operand before a child receives malformed arguments", (option) => {
    expect(() => boundedFfmpegArgs([option], 2)).toThrow(
      `Missing value for FFmpeg option ${option}`,
    );
  });
  it("bounds every decoder, the encoder and both filter pools without moving output", () => {
    expect(
      boundedFfmpegArgs(
        ["-y", "-ss", "2", "-i", "a.mp4", "-i", "b.wav", "-c:v", "libx264", "out.mp4"],
        2,
      ),
    ).toEqual([
      "-filter_threads",
      "2",
      "-filter_complex_threads",
      "2",
      "-y",
      "-ss",
      "2",
      "-threads",
      "2",
      "-i",
      "a.mp4",
      "-threads",
      "2",
      "-i",
      "b.wav",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "out.mp4",
    ]);
  });

  it("preserves explicit caller thread settings and bounds automatic zero values", () => {
    const args = boundedFfmpegArgs(
      [
        "-filter_threads",
        "3",
        "-filter_complex_threads",
        "0",
        "-threads",
        "4",
        "-i",
        "a.mp4",
        "-threads:v",
        "0",
        "out.mp4",
      ],
      2,
    );
    expect(args).toEqual([
      "-filter_threads",
      "3",
      "-filter_complex_threads",
      "2",
      "-threads",
      "4",
      "-i",
      "a.mp4",
      "-threads:v",
      "2",
      "out.mp4",
    ]);
  });

  it("caps x265 pools while retaining HDR metadata and deliberate pool settings", () => {
    const metadata = "colorprim=bt2020:master-display=G(1,2):max-cll=1000,400";
    const args = boundedFfmpegArgs(
      ["-i", "pipe:0", "-c:v", "libx265", "-x265-params", metadata, "out.mp4"],
      2,
    );
    expect(args[args.indexOf("-x265-params") + 1]).toBe(`${metadata}:pools=2:frame-threads=2`);
    const explicit = boundedFfmpegArgs(
      ["-i", "a", "-x265-params", "pools=1:frame-threads=1", "out"],
      2,
    );
    expect(explicit[explicit.indexOf("-x265-params") + 1]).toBe("pools=1:frame-threads=1");
    const defaults = boundedFfmpegArgs(["-i", "a", "-c:v", "libx265", "out"], 1);
    expect(defaults[defaults.indexOf("-x265-params") + 1]).toBe("pools=1:frame-threads=1");
    expect(boundedFfmpegArgs(["-version"], 2)).toEqual(["-version"]);
  });

  it("limits ffprobe without adding FFmpeg-only filter options or breaking -- paths", () => {
    expect(boundedFfprobeArgs(["-v", "error", "--", "-filename.mp4"], 2)).toEqual([
      "-threads",
      "2",
      "-v",
      "error",
      "--",
      "-filename.mp4",
    ]);
    expect(boundedFfprobeArgs(["-threads", "0", "--", "file"], 1)).toEqual([
      "-threads",
      "1",
      "--",
      "file",
    ]);
  });
});

describe("bounded media scheduling", () => {
  it("preserves valid undefined items and returns an empty result for no work", async () => {
    expect(
      await mapMediaWork([undefined, "source"], async (item, index) => ({ item, index })),
    ).toEqual([
      { item: undefined, index: 0 },
      { item: "source", index: 1 },
    ]);
    expect(
      await mapMediaWork([], async () => {
        throw new Error("No work expected");
      }),
    ).toEqual([]);
  });
  it("drains rejected and cancelled requests without leaking permits", async () => {
    const limiter = new MediaProcessLimiter(() => 1);
    const release = await limiter.acquire();
    const controller = new AbortController();
    const cancelled = limiter.acquire(controller.signal);
    const rejected = expect(cancelled).rejects.toThrow("cancel queued");
    controller.abort(new Error("cancel queued"));
    await rejected;
    const next = limiter.acquire();
    release();
    release();
    const releaseNext = await next;
    const task = (async () => {
      try {
        throw new Error("child failed");
      } finally {
        releaseNext();
      }
    })();
    await expect(task).rejects.toThrow("child failed");
    (await limiter.acquire())();
    await expect(limiter.acquire(controller.signal)).rejects.toThrow("cancel queued");
    (await limiter.acquire())();
  });

  it("keeps eighteen preparations bounded and allows nested fallback batches", async () => {
    vi.stubEnv("HYPERFRAMES_RENDER_CPU_LIMIT", "2");
    let active = 0;
    let peak = 0;
    const result = await mapMediaWork(
      Array.from({ length: 18 }, (_, i) => i),
      async (item) => {
        peak = Math.max(peak, ++active);
        try {
          return (await mapMediaWork([item], async (value) => value * 2))[0];
        } finally {
          active--;
        }
      },
    );
    expect(peak).toBe(1);
    expect(result).toEqual(Array.from({ length: 18 }, (_, i) => i * 2));
  });

  it("waits for running siblings before propagating failure and stops new work", async () => {
    vi.stubEnv("HYPERFRAMES_RENDER_CPU_LIMIT", "4");
    let finish!: () => void;
    const sibling = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let settled = false;
    const started: number[] = [];
    const work = mapMediaWork([0, 1, 2, 3], async (item) => {
      started.push(item);
      if (item === 0) throw new Error("failure");
      await sibling;
      return item;
    });
    const assertion = expect(
      work.finally(() => {
        settled = true;
      }),
    ).rejects.toThrow("failure");
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await assertion;
    expect(started).toEqual([0, 1]);
  });

  it("lets extraction proceed while an HDR streaming encoder waits for its frames", async () => {
    vi.stubEnv("HYPERFRAMES_RENDER_CPU_LIMIT", "1");
    const releaseEncoder = await acquireStreamingEncoder();
    try {
      const releaseExtraction = await acquireMediaProcess();
      releaseExtraction();
    } finally {
      releaseEncoder();
    }
  });
});
