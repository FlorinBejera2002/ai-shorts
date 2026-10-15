import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";

export const RENDER_CPU_LIMIT_ENV = "HYPERFRAMES_RENDER_CPU_LIMIT";

function cpuQuota(): number | undefined {
  if (process.platform !== "linux") return;
  try {
    const [quota, period] = readFileSync("/sys/fs/cgroup/cpu.max", "utf8").trim().split(/\s+/);
    if (quota !== "max" && Number(quota) > 0 && Number(period) > 0)
      return Number(quota) / Number(period);
  } catch {
    /* Older containers expose the v1 CPU controller. */
  }
  try {
    const quota = Number(readFileSync("/sys/fs/cgroup/cpu/cpu.cfs_quota_us", "utf8"));
    const period = Number(readFileSync("/sys/fs/cgroup/cpu/cpu.cfs_period_us", "utf8"));
    if (quota > 0 && period > 0) return quota / period;
  } catch {
    /* Sandboxes receive an explicit budget instead of a cgroup mount. */
  }
}

export function renderResourceLimits(
  input: { cpuCount?: number; quota?: number; configuredCpu?: string } = {},
) {
  const available = Math.max(1, input.cpuCount ?? availableParallelism());
  const quota = input.quota ?? cpuQuota() ?? available;
  const configured = input.configuredCpu ?? process.env[RENDER_CPU_LIMIT_ENV];
  const requested = configured === undefined ? available : Number(configured);
  // An invalid explicit deployment value fails conservatively instead of restoring host fan-out.
  const cpuCount = Math.max(
    1,
    Math.floor(
      Math.min(available, quota, Number.isFinite(requested) && requested > 0 ? requested : 1),
    ),
  );
  const mediaConcurrency = Math.max(1, Math.min(4, Math.floor(cpuCount / 2)));
  return {
    cpuCount,
    restricted: configured !== undefined || quota < available,
    mediaConcurrency,
    ffmpegThreads: Math.max(1, Math.min(4, Math.floor(cpuCount / mediaConcurrency))),
    captureWorkers: Math.max(1, Math.floor(cpuCount / 2)),
  };
}

/** A process-wide queue also covers probes started outside extraction/audio batches. */
export class MediaProcessLimiter {
  private active = 0;
  private readonly waiting: Array<{ start: () => void; signal?: AbortSignal; abort: () => void }> =
    [];
  constructor(private readonly maximum: () => number) {}
  acquire(signal?: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        start: () => {
          signal?.removeEventListener("abort", entry.abort);
          this.active++;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            this.active--;
            this.drain();
          });
        },
        abort: () => {
          const index = this.waiting.indexOf(entry);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(signal?.reason ?? new Error("Media operation cancelled"));
        },
      };
      if (signal?.aborted) {
        entry.abort();
        return;
      }
      signal?.addEventListener("abort", entry.abort, { once: true });
      this.waiting.push(entry);
      this.drain();
    });
  }
  private drain() {
    while (this.active < Math.max(1, this.maximum())) {
      const entry = this.waiting.shift();
      if (!entry) break;
      entry.start();
    }
  }
}

const mediaProcesses = new MediaProcessLimiter(() => renderResourceLimits().mediaConcurrency);
export const acquireMediaProcess = (signal?: AbortSignal) => mediaProcesses.acquire(signal);
// A streaming encoder waits for frames from extraction. Sharing its permit with
// extraction would deadlock a one-process budget, particularly in the HDR path.
const streamingEncoders = new MediaProcessLimiter(() => 1);
export const acquireStreamingEncoder = (signal?: AbortSignal) => streamingEncoders.acquire(signal);

/** Bound preparation itself, and wait for running siblings before returning a failure. */
export async function mapMediaWork<T, R>(
  items: readonly T[],
  operation: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const entries = items.entries();
  let failure: { error: unknown } | undefined;
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, renderResourceLimits().mediaConcurrency) },
      async () => {
        while (!failure) {
          const next = entries.next();
          if (next.done) break;
          const [index, item] = next.value;
          try {
            results[index] = await operation(item, index);
          } catch (error) {
            failure ??= { error };
          }
        }
      },
    ),
  );
  if (failure) throw failure.error;
  return results;
}

/** FFmpeg codec options are scoped per input/output; globals alone do not limit decoders. */
export function boundedFfmpegArgs(
  args: readonly string[],
  threads = renderResourceLimits().ffmpegThreads,
): string[] {
  if (
    args.some((arg) =>
      [
        "-version",
        "-encoders",
        "-decoders",
        "-filters",
        "-formats",
        "-hwaccels",
        "-h",
        "-help",
      ].includes(arg),
    )
  )
    return [...args];
  const count = String(threads);
  const result: string[] = [];
  for (const option of ["-filter_threads", "-filter_complex_threads"])
    if (!args.includes(option)) result.push(option, count);
  const entries = args.entries();
  const valueAfter = (option: string): string => {
    const next = entries.next();
    if (next.done) throw new Error(`Missing value for FFmpeg option ${option}`);
    return next.value[1];
  };
  let groupHasThreads = false;
  for (const [index, arg] of entries) {
    if (arg === "-filter_threads" || arg === "-filter_complex_threads") {
      const value = valueAfter(arg);
      result.push(arg, value === "0" ? count : value);
    } else if (/^-threads(?::.*)?$/.test(arg)) {
      groupHasThreads = true;
      const value = valueAfter(arg);
      result.push(arg, value === "0" ? count : value);
    } else if (arg === "-x265-params") {
      const values = valueAfter(arg).split(":");
      if (!values.some((value) => value.startsWith("pools="))) values.push(`pools=${count}`);
      if (!values.some((value) => value.startsWith("frame-threads=")))
        values.push(`frame-threads=${count}`);
      result.push(arg, values.join(":"));
    } else if (arg === "-i") {
      if (!groupHasThreads) result.push("-threads", count);
      result.push(arg, valueAfter(arg));
      groupHasThreads = false;
    } else {
      // Renderer commands have one final output; inserting here keeps -y and all
      // output options in their group while retaining the output path as the last argument.
      if (index === args.length - 1) {
        if (args.includes("libx265") && !args.includes("-x265-params"))
          result.push("-x265-params", `pools=${count}:frame-threads=${count}`);
        if (!groupHasThreads) result.push("-threads", count);
      }
      result.push(arg);
    }
  }
  return result;
}

export function boundedFfprobeArgs(
  args: readonly string[],
  threads = renderResourceLimits().ffmpegThreads,
): string[] {
  const result = [...args];
  const index = result.findIndex((arg) => /^-threads(?::.*)?$/.test(arg));
  if (index < 0) result.unshift("-threads", String(threads));
  else if (result[index + 1] === "0") result[index + 1] = String(threads);
  return result;
}
