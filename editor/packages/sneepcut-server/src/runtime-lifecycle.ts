interface RuntimeJob {
  cancel(): void;
  settled: Promise<void>;
}

/** Drain admitted requests and actual job completion before deleting an owner's files. */
export class RuntimeLifecycle {
  private controller = new AbortController();
  private requests = new Set<Promise<void>>();
  private jobs = new Set<RuntimeJob>();
  private closing: Promise<void> | undefined;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  admitRequest(): (() => void) | null {
    if (this.signal.aborted) return null;
    const { promise, resolve } = Promise.withResolvers<void>();
    this.requests.add(promise);
    return () => {
      this.requests.delete(promise);
      resolve();
    };
  }

  ensureOpen(): void {
    if (this.signal.aborted) throw new Error("Studio account runtime is closed");
  }

  trackJob<T extends RuntimeJob>(job: T): T {
    this.jobs.add(job);
    if (this.signal.aborted) job.cancel();
    const finished = () => this.jobs.delete(job);
    void job.settled.then(finished, finished);
    return job;
  }

  close(dispose: () => void): Promise<void> {
    if (this.closing) return this.closing;
    this.controller.abort();
    for (const job of this.jobs) job.cancel();
    this.closing = (async () => {
      await Promise.all(this.requests);
      for (const job of this.jobs) job.cancel();
      await Promise.allSettled([...this.jobs].map((job) => job.settled));
      dispose();
    })();
    return this.closing;
  }
}
