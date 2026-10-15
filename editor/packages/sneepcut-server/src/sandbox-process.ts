import { spawn, type ChildProcess } from "node:child_process";
import { availableParallelism } from "node:os";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

export type SandboxKind = "render" | "thumbnail" | "background" | "probe";

export function sandboxProcessLimits(kind: SandboxKind, capacity = availableParallelism()) {
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new RangeError("Sandbox CPU capacity must be a positive integer");
  const wallMilliseconds = kind === "thumbnail" || kind === "probe" ? 60_000 : 600_000;
  // RLIMIT_CPU counts CPU time across a process's threads, not elapsed time.
  // Use affinity capacity rather than the renderer's smaller worker budget or a
  // cgroup quota that can increase while the job is running. Wall time stays bounded.
  const cpuSeconds = Math.ceil((wallMilliseconds / 1000 + 1) * capacity);
  if (!Number.isSafeInteger(cpuSeconds)) throw new RangeError("Sandbox CPU budget is too large");
  return { wallMilliseconds, cpuSeconds };
}

interface SandboxProgress {
  progress: number;
  stage?: string;
}

type FailureReason = "timeout" | "cancelled" | "signal" | "exit" | "spawn";

export class SandboxProcessError extends Error {
  constructor(
    readonly kind: SandboxKind,
    readonly reason: FailureReason,
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly stderr: string,
    readonly lastProgress: SandboxProgress | undefined,
    limits: ReturnType<typeof sandboxProcessLimits>,
    cause?: Error,
  ) {
    const detail =
      reason === "timeout"
        ? `timed out after ${limits.wallMilliseconds / 1000} seconds (wall limit)`
        : reason === "cancelled"
          ? "cancelled"
          : reason === "signal"
            ? `terminated by ${signal}`
            : reason === "spawn"
              ? `could not start: ${cause?.message.slice(0, 1000) ?? "unknown spawn error"}`
              : `exited with code ${exitCode}`;
    const progress = lastProgress
      ? ` Last progress: ${lastProgress.progress}%${lastProgress.stage ? ` (${lastProgress.stage})` : ""}.`
      : " No progress reported.";
    super(
      `Isolated Studio ${kind} ${detail}.${progress} CPU limit: ${limits.cpuSeconds} seconds.${stderr ? ` Renderer stderr: ${stderr}` : ""}`,
      { cause },
    );
    this.name = "SandboxProcessError";
  }
}

interface SandboxChild extends Pick<ChildProcess, "pid" | "once" | "removeListener"> {
  stdout: Readable;
  stderr: Readable;
}

interface ProcessDependencies {
  spawnProcess: (arguments_: string[]) => SandboxChild;
  killGroup: (pid: number) => void;
  scheduleTimeout: (callback: () => void, milliseconds: number) => () => void;
}

const processDependencies: ProcessDependencies = {
  spawnProcess: (arguments_) =>
    spawn("/usr/bin/prlimit", arguments_, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin" },
    }),
  killGroup: (pid) => {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // The process group may already have exited; close still owns settlement.
    }
  },
  scheduleTimeout: (callback, milliseconds) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};

export function runSandboxProcess(
  options: {
    kind: SandboxKind;
    commandArguments: string[];
    signal: AbortSignal;
    onProgress?: (progress: number, stage?: string) => void;
  },
  dependencies: ProcessDependencies = processDependencies,
): Promise<void> {
  const { kind, signal, onProgress } = options;
  const limits = sandboxProcessLimits(kind);
  return new Promise<void>((resolve, reject) => {
    let stopped: "timeout" | "cancelled" | undefined;
    let settled = false;
    let stderr = "";
    let pending = "";
    let lastProgress: SandboxProgress | undefined;
    const failure = (
      reason: FailureReason,
      code: number | null,
      signal: NodeJS.Signals | null,
      cause?: Error,
    ) => new SandboxProcessError(kind, reason, code, signal, stderr, lastProgress, limits, cause);
    if (signal.aborted) {
      reject(failure("cancelled", null, null));
      return;
    }
    let child: SandboxChild;
    try {
      child = dependencies.spawnProcess([
        "--fsize=1073741824",
        "--nofile=4096",
        `--cpu=${limits.cpuSeconds}`,
        "--",
        "/usr/bin/bwrap",
        ...options.commandArguments,
      ]);
    } catch (error) {
      reject(
        failure("spawn", null, null, error instanceof Error ? error : new Error(String(error))),
      );
      return;
    }
    const decoder = new StringDecoder("utf8");
    const readProgress = (line: string) => {
      if (!line.startsWith("STUDIO_PROGRESS ")) return;
      try {
        const update: unknown = JSON.parse(line.slice(16));
        if (!update || typeof update !== "object" || !("progress" in update)) return;
        if (typeof update.progress !== "number" || !Number.isFinite(update.progress)) return;
        lastProgress = {
          progress: Math.max(0, Math.min(99, update.progress)),
          stage:
            "stage" in update && typeof update.stage === "string"
              ? update.stage.slice(0, 200)
              : undefined,
        };
        onProgress?.(lastProgress.progress, lastProgress.stage);
      } catch {
        // Ignore unrelated output and malformed progress messages.
      }
    };
    const readStdout = (chunk: Buffer) => {
      const lines = (pending + decoder.write(chunk)).split("\n");
      pending = (lines.pop() ?? "").slice(-8192);
      for (const line of lines) readProgress(line);
    };
    const readStderr = (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8000);
    };
    const stop = (reason: "timeout" | "cancelled") => {
      if (settled || stopped) return;
      stopped = reason;
      if (child.pid) dependencies.killGroup(child.pid);
    };
    const abort = () => stop("cancelled");
    let cancelTimeout = () => {};
    const cleanup = () => {
      cancelTimeout();
      signal.removeEventListener("abort", abort);
      child.stdout.removeListener("data", readStdout);
      child.stderr.removeListener("data", readStderr);
      child.removeListener("error", spawnError);
      child.removeListener("close", close);
    };
    const spawnError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(failure(stopped ?? "spawn", null, null, error));
    };
    const close = (code: number | null, terminationSignal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      readProgress(pending + decoder.end());
      cleanup();
      if (!stopped && code === 0 && !terminationSignal) resolve();
      else
        reject(
          failure(stopped ?? (terminationSignal ? "signal" : "exit"), code, terminationSignal),
        );
    };
    child.stdout.on("data", readStdout);
    child.stderr.on("data", readStderr);
    child.once("error", spawnError);
    child.once("close", close);
    cancelTimeout = dependencies.scheduleTimeout(() => stop("timeout"), limits.wallMilliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
