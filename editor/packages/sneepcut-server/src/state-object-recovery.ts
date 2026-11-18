import { HTTPException } from "hono/http-exception";

export interface RecoveryPolicy {
  maxAttempts: number;
  timeoutMs: number;
  attemptTimeoutMs: number;
  baseDelayMs: number;
}

const defaults: RecoveryPolicy = {
  maxAttempts: 3,
  timeoutMs: 120_000,
  attemptTimeoutMs: 30_000,
  baseDelayMs: 250,
};

export class TemporaryStorageError extends Error {
  constructor(readonly retryAfterMs = 0) {
    super("Temporary Studio object storage failure");
  }
}

export class StateStorageUnavailable extends HTTPException {
  constructor() {
    super(503, { message: "Studio object storage is temporarily unavailable. Please retry." });
  }
}

export function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

/** One budget shared by attempts, response bodies, backoff and write reconciliation. */
export class StateObjectRecovery {
  readonly policy: RecoveryPolicy;
  private readonly deadline: number;
  private attempts = 0;

  constructor(policy: Partial<RecoveryPolicy> = {}) {
    this.policy = { ...defaults, ...policy };
    for (const value of Object.values(this.policy))
      if (!Number.isFinite(value) || value < 0) throw new Error("Invalid S3 recovery policy");
    if (
      this.policy.maxAttempts < 1 ||
      this.policy.timeoutMs < 1 ||
      this.policy.attemptTimeoutMs < 1
    )
      throw new Error("Invalid S3 recovery policy");
    this.deadline = performance.now() + this.policy.timeoutMs;
  }

  signal(streaming = false) {
    const remaining = Math.ceil(this.deadline - performance.now());
    if (remaining <= 0) throw new StateStorageUnavailable();
    return AbortSignal.timeout(
      streaming ? remaining : Math.min(remaining, this.policy.attemptTimeoutMs),
    );
  }

  nextRequest() {
    const timeoutMs = Math.ceil(this.deadline - performance.now());
    if (timeoutMs <= 0) throw new StateStorageUnavailable();
    return new StateObjectRecovery({ ...this.policy, timeoutMs });
  }

  async waitForProvider(delay: number) {
    if (performance.now() + delay >= this.deadline) throw new StateStorageUnavailable();
    if (delay > 0) await Bun.sleep(delay);
  }

  private async pause(error: TemporaryStorageError) {
    const jitter =
      Math.random() * Math.min(2000, this.policy.baseDelayMs * 2 ** (this.attempts - 1));
    const delay = Math.max(jitter, error.retryAfterMs);
    if (performance.now() + delay >= this.deadline) throw new StateStorageUnavailable();
    await Bun.sleep(delay);
  }

  async run<T>(operation: (signal: AbortSignal) => Promise<T>, streaming = false): Promise<T> {
    if (this.attempts > 0) await this.pause(new TemporaryStorageError());
    while (this.attempts < this.policy.maxAttempts) {
      const signal = this.signal(streaming);
      this.attempts++;
      try {
        return await operation(signal);
      } catch (error) {
        if (!(error instanceof TemporaryStorageError)) throw error;
        if (this.attempts >= this.policy.maxAttempts) break;
        await this.pause(error);
      }
    }
    throw new StateStorageUnavailable();
  }
}
