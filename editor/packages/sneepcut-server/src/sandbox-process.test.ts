import { describe, expect, it, mock, spyOn } from "bun:test";
import { ChildProcess, spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { PassThrough } from "node:stream";
import { runSandboxProcess, sandboxProcessLimits, SandboxProcessError } from "./sandbox-process";

class FakeChild extends ChildProcess {
  pid = 42;
  stdout = new PassThrough();
  stderr = new PassThrough();
}

function fixture(controller = new AbortController()) {
  const child = new FakeChild();
  const onProgress = mock((_progress: number, _stage?: string) => {});
  const cancelTimeout = mock(() => {});
  let timeout: (() => void) | undefined;
  const dependencies = {
    spawnProcess: mock((_arguments: string[]) => child),
    killGroup: mock((_pid: number) => {}),
    scheduleTimeout: mock((callback: () => void, _milliseconds: number) => {
      timeout = callback;
      return cancelTimeout;
    }),
  };
  const run = () =>
    runSandboxProcess(
      {
        kind: "render",
        commandArguments: ["--new-session", "worker"],
        signal: controller.signal,
        onProgress,
      },
      dependencies,
    ).then(
      () => undefined,
      (error: unknown) => {
        if (!(error instanceof SandboxProcessError)) throw error;
        return error;
      },
    );
  const fireTimeout = () => {
    if (!timeout) throw new Error("No timeout was scheduled");
    timeout();
  };
  const expectClean = () => {
    expect(cancelTimeout).toHaveBeenCalledTimes(1);
    expect(child.listenerCount("close")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
    expect(child.stdout.listenerCount("data")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
  };
  return {
    child,
    controller,
    dependencies,
    cancelTimeout,
    onProgress,
    run,
    fireTimeout,
    expectClean,
  };
}

async function failure(outcome: ReturnType<ReturnType<typeof fixture>["run"]>) {
  const error = await outcome;
  expect(error).toBeInstanceOf(SandboxProcessError);
  if (!error) throw new Error("Expected sandbox failure");
  return error;
}

describe("sandbox CPU and wall budgets", () => {
  it("keeps wall deadlines while allowing cumulative CPU across available cores", () => {
    for (const capacity of [1, 2, 4, 16]) {
      for (const kind of ["render", "background"] as const)
        expect(sandboxProcessLimits(kind, capacity)).toEqual({
          wallMilliseconds: 600_000,
          cpuSeconds: 601 * capacity,
        });
      for (const kind of ["thumbnail", "probe"] as const)
        expect(sandboxProcessLimits(kind, capacity)).toEqual({
          wallMilliseconds: 60_000,
          cpuSeconds: 61 * capacity,
        });
    }
  });

  it("does not mistake the internal two-CPU renderer budget for a CPU hard limit", () => {
    const saved = process.env.HYPERFRAMES_RENDER_CPU_LIMIT;
    process.env.HYPERFRAMES_RENDER_CPU_LIMIT = "2";
    try {
      expect(sandboxProcessLimits("render").cpuSeconds).toBe(601 * availableParallelism());
      expect(sandboxProcessLimits("render", 16).cpuSeconds).toBe(9616);
    } finally {
      if (saved === undefined) delete process.env.HYPERFRAMES_RENDER_CPU_LIMIT;
      else process.env.HYPERFRAMES_RENDER_CPU_LIMIT = saved;
    }
  });

  it("never creates an infinite or malformed hard limit", () => {
    for (const capacity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
      expect(() => sandboxProcessLimits("render", capacity)).toThrow(RangeError);
  });
});

describe("sandbox subprocess supervision", () => {
  it("applies finite prlimit arguments and cleans up after successful close", async () => {
    const test = fixture();
    const removeAbort = spyOn(test.controller.signal, "removeEventListener");
    try {
      const result = test.run();
      expect(test.dependencies.spawnProcess.mock.calls[0]?.[0]).toEqual([
        "--fsize=1073741824",
        "--nofile=4096",
        `--cpu=${sandboxProcessLimits("render").cpuSeconds}`,
        "--",
        "/usr/bin/bwrap",
        "--new-session",
        "worker",
      ]);
      expect(test.dependencies.scheduleTimeout.mock.calls[0]?.[1]).toBe(600_000);
      test.child.emit("close", 0, null);
      expect(await result).toBeUndefined();
      test.expectClean();
      expect(removeAbort).toHaveBeenCalledTimes(1);
      test.controller.abort();
      test.fireTimeout();
      expect(test.dependencies.killGroup).not.toHaveBeenCalled();
    } finally {
      removeAbort.mockRestore();
    }
  });

  it("keeps bounded stderr and the latest valid progress before exit diagnostics", async () => {
    const test = fixture();
    const result = test.run();
    test.child.stdout.write('noise\nSTUDIO_PROGRESS {broken}\nSTUDIO_PROGRESS {"progress":null}\n');
    test.child.stdout.write('STUDIO_PROGRESS {"progress":40,"stage":"capture"}\n');
    const progress = Buffer.from('STUDIO_PROGRESS {"progress":55,"stage":"încodare"}');
    const split = progress.indexOf(Buffer.from("î")) + 1;
    test.child.stdout.write(progress.subarray(0, split));
    test.child.stdout.write(progress.subarray(split));
    test.child.stderr.write("discarded prefix" + "x".repeat(9000) + "encoder failed");
    test.child.emit("close", 17, null);
    const error = await failure(result);
    expect(error).toMatchObject({
      reason: "exit",
      exitCode: 17,
      signal: null,
      lastProgress: { progress: 55, stage: "încodare" },
    });
    expect(error.stderr.length).toBe(8000);
    expect(error.stderr.endsWith("encoder failed")).toBe(true);
    expect(error.message.slice(0, 300)).toContain("55% (încodare)");
    expect(error.message).not.toContain("discarded prefix");
    expect(test.onProgress.mock.calls).toEqual([
      [40, "capture"],
      [55, "încodare"],
    ]);
    test.expectClean();
  });

  it.each(["SIGKILL", "SIGTERM", "SIGXCPU"] as const)(
    "reports external %s without inventing its cause",
    async (signal) => {
      const test = fixture();
      const result = test.run();
      test.child.emit("close", null, signal);
      const error = await failure(result);
      expect(error).toMatchObject({ reason: "signal", exitCode: null, signal });
      expect(error.message).toContain(`terminated by ${signal}`);
      expect(error.message).not.toContain("timed out");
      expect(error.message).not.toContain("CPU limit exceeded");
      expect(test.dependencies.killGroup).not.toHaveBeenCalled();
      test.expectClean();
    },
  );

  it("waits for close after timeout and never accepts a subsequent zero exit", async () => {
    const test = fixture();
    let settled = false;
    const result = test.run().then((value) => {
      settled = true;
      return value;
    });
    test.fireTimeout();
    await Promise.resolve();
    expect(settled).toBe(false);
    test.controller.abort();
    expect(test.dependencies.killGroup.mock.calls).toEqual([[42]]);
    test.child.emit("close", 0, null);
    const error = await failure(result);
    expect(error.reason).toBe("timeout");
    expect(error.message).toContain("600 seconds (wall limit)");
    test.expectClean();
  });

  it("keeps cancellation distinct when a deadline fires before the killed child closes", async () => {
    const test = fixture();
    const result = test.run();
    test.controller.abort();
    test.fireTimeout();
    test.child.emit("close", null, "SIGKILL");
    expect(await failure(result)).toMatchObject({ reason: "cancelled", signal: "SIGKILL" });
    expect(test.dependencies.killGroup.mock.calls).toEqual([[42]]);
    test.expectClean();
  });

  it("does not spawn an already cancelled job", async () => {
    const test = fixture();
    test.controller.abort();
    expect((await failure(test.run())).reason).toBe("cancelled");
    expect(test.dependencies.spawnProcess).not.toHaveBeenCalled();
    expect(test.dependencies.scheduleTimeout).not.toHaveBeenCalled();
  });

  it("catches cancellation that arrives while spawning", async () => {
    const test = fixture();
    test.dependencies.spawnProcess.mockImplementation(() => {
      test.controller.abort();
      return test.child;
    });
    const result = test.run();
    expect(test.dependencies.killGroup.mock.calls).toEqual([[42]]);
    test.child.emit("close", null, "SIGKILL");
    expect((await failure(result)).reason).toBe("cancelled");
    test.expectClean();
  });

  it("cleans timers and listeners when spawn emits an error before close", async () => {
    const test = fixture();
    const result = test.run();
    const cause = new Error("spawn /usr/bin/prlimit ENOENT");
    test.child.emit("error", cause);
    const error = await failure(result);
    expect(error).toMatchObject({ reason: "spawn", cause });
    expect(error.message).toContain("could not start");
    test.expectClean();
    test.child.emit("close", -2, null);
    test.fireTimeout();
    test.controller.abort();
    expect(test.dependencies.killGroup).not.toHaveBeenCalled();
  });

  it("reports synchronous spawn errors without leaving a timeout", async () => {
    const test = fixture();
    test.dependencies.spawnProcess.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    expect((await failure(test.run())).reason).toBe("spawn");
    expect(test.dependencies.scheduleTimeout).not.toHaveBeenCalled();
  });
});

// Opt in on Linux: exercises the kernel's real per-process CPU accounting across
// worker threads. The small old budget reproduces the unit mismatch in seconds.
it.skipIf(process.platform !== "linux" || process.env.SNEEPCUT_SANDBOX_CPU_INTEGRATION !== "1")(
  "integration: prlimit stops a threaded CPU workload with the old budget, but the calculated budget completes",
  async () => {
    const workload = `
      const { Worker } = require('node:worker_threads');
      const work = "const { parentPort } = require('node:worker_threads'); let x=1; while(true) { for(let i=0;i<100000;i++) x=Math.imul(x,1664525)+1013904223; const usage=process.cpuUsage(); if(usage.user+usage.system>=2500000) break; } parentPort.postMessage(x);";
      const workers = Array.from({ length: 2 }, () => new Worker(work, { eval: true }));
      Promise.all(workers.map(worker => new Promise((resolve,reject) => { worker.on('error',reject); worker.on('exit',code => code===0 ? resolve() : reject(new Error('worker exit '+code))); }))).then(() => console.log('completed'));
    `;
    const run = (cpuSeconds: number) =>
      new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>(
        (resolve, reject) => {
          const child = spawn(
            "/usr/bin/prlimit",
            [`--cpu=${cpuSeconds}`, "--", process.execPath, "-e", workload],
            { detached: true, stdio: ["ignore", "pipe", "pipe"] },
          );
          let output = "";
          child.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
          });
          const timer = setTimeout(() => {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          }, 15_000);
          child.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.once("close", (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal, output });
          });
        },
      );
    const old = await run(1);
    expect(old.code).toBeNull();
    expect(old.signal).toBe("SIGKILL");
    expect(old.output).not.toContain("completed");
    const corrected = await run(sandboxProcessLimits("probe").cpuSeconds);
    expect(corrected).toEqual({ code: 0, signal: null, output: "completed\n" });
  },
  35_000,
);
