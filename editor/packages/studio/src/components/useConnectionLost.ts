import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Answers whether the Studio server is reachable again. Any HTTP answer counts. */
export async function probeStudioServer(
  fetcher: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetcher("/api/projects", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Waits between automatic probes while the browser is online but the server is not answering. */
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000] as const;
/** Consecutive failed Studio API requests that count as a server outage. */
export const FAILED_REQUESTS_BEFORE_LOST = 3;

function isStudioApiRequest(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Counts Studio API requests that fail at the network level (no HTTP answer at all) and reports
 * a server outage after a few in a row. Any answer, even an error status, resets the count.
 * Returns the function that puts the original `fetch` back.
 */
function watchStudioRequests(onOutage: () => void): () => void {
  const original = window.fetch;
  let failures = 0;
  const watched: typeof fetch = async (input, init) => {
    try {
      const response = await original(input, init);
      if (isStudioApiRequest(input)) failures = 0;
      return response;
    } catch (error) {
      if (isStudioApiRequest(input) && !isAbort(error)) {
        failures += 1;
        if (failures >= FAILED_REQUESTS_BEFORE_LOST) {
          failures = 0;
          onOutage();
        }
      }
      throw error;
    }
  };
  window.fetch = watched;
  return () => {
    // Someone may have wrapped fetch after us; only unwind our own layer.
    if (window.fetch === watched) window.fetch = original;
  };
}

export interface ConnectionLostState {
  lost: boolean;
  checking: boolean;
  reconnect: () => void;
  /** Hide the dialog until the browser reports the next disconnect (phone "Închide"). */
  dismiss: () => void;
}

/**
 * Tracks the connection to the Studio server (St-Offline). The dialog opens when the browser
 * goes offline or when Studio API requests keep failing without an answer, and closes once the
 * server answers again. While the browser is online, a failed probe is retried on its own with
 * backoff (2s, 4s, 8s, 16s, then every 30s), so a server that comes back after the `online`
 * event still closes the dialog without a click.
 */
export function useConnectionLost(
  probe: () => Promise<boolean> = probeStudioServer,
): ConnectionLostState {
  const [lost, setLost] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [checking, setChecking] = useState(false);
  const probing = useRef(false);
  const attempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const lostRef = useRef(lost);
  useLayoutEffect(() => {
    lostRef.current = lost;
  }, [lost]);

  const clearRetry = useCallback(() => {
    if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const reconnect = useCallback(() => {
    if (probing.current) return;
    clearRetry();
    probing.current = true;
    setChecking(true);
    void probe().then((reachable) => {
      probing.current = false;
      if (!mounted.current) return;
      setChecking(false);
      if (reachable) {
        attempt.current = 0;
        setLost(false);
        return;
      }
      // Offline: the next `online` event probes again, no point polling. Nothing to recover
      // from either when the dialog is not showing.
      if (!navigator.onLine || !lostRef.current) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt.current, RETRY_DELAYS_MS.length - 1)];
      attempt.current += 1;
      retryTimer.current = setTimeout(reconnect, delay);
    });
  }, [probe, clearRetry]);

  useEffect(() => {
    mounted.current = true;
    const onOffline = () => {
      clearRetry();
      attempt.current = 0;
      lostRef.current = true;
      setLost(true);
    };
    const onOnline = () => {
      attempt.current = 0;
      reconnect();
    };
    const onOutage = () => {
      lostRef.current = true;
      setLost(true);
      reconnect();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    const unwatch = watchStudioRequests(onOutage);
    return () => {
      mounted.current = false;
      clearRetry();
      unwatch();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [reconnect, clearRetry]);

  const dismiss = useCallback(() => {
    clearRetry();
    setLost(false);
  }, [clearRetry]);
  return { lost, checking, reconnect, dismiss };
}
