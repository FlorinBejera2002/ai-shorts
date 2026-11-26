// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAILED_REQUESTS_BEFORE_LOST,
  probeStudioServer,
  useConnectionLost,
  type ConnectionLostState,
} from "./useConnectionLost";

describe("probeStudioServer", () => {
  it("treats any HTTP answer as reachable and a network error as not", async () => {
    expect(await probeStudioServer(vi.fn(async () => new Response("", { status: 401 })))).toBe(
      true,
    );
    expect(
      await probeStudioServer(
        vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      ),
    ).toBe(false);
  });
});

describe("useConnectionLost", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let latest: ConnectionLostState | null = null;
  let reachable = false;
  const probe = vi.fn(async () => reachable);

  function Probe() {
    latest = useConnectionLost(probe);
    return null;
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    reachable = false;
    probe.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens when the browser goes offline and stays open until the server answers", async () => {
    expect(latest?.lost).toBe(false);
    await act(async () => window.dispatchEvent(new Event("offline")));
    expect(latest?.lost).toBe(true);

    await act(async () => latest?.reconnect());
    expect(probe).toHaveBeenCalledTimes(1);
    expect(latest?.lost).toBe(true);

    reachable = true;
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(latest?.lost).toBe(false);
  });

  it("keeps probing with backoff when the server is not up yet as the browser comes back", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => window.dispatchEvent(new Event("offline")));
      await act(async () => window.dispatchEvent(new Event("online")));
      expect(probe).toHaveBeenCalledTimes(1);
      expect(latest?.lost).toBe(true);

      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(probe).toHaveBeenCalledTimes(2);
      await act(async () => vi.advanceTimersByTimeAsync(3999));
      expect(probe).toHaveBeenCalledTimes(2);

      reachable = true;
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(probe).toHaveBeenCalledTimes(3);
      expect(latest?.lost).toBe(false);

      // Recovered: no further polling.
      await act(async () => vi.advanceTimersByTimeAsync(60000));
      expect(probe).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens on repeated Studio API failures while the browser stays online", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    // Remount over a failing fetch so the hook wraps it.
    await act(async () => root.unmount());
    vi.stubGlobal("fetch", failing);
    root = createRoot(container);
    await act(async () => root.render(<Probe />));

    for (let i = 0; i < FAILED_REQUESTS_BEFORE_LOST - 1; i++) {
      await act(async () => {
        await window.fetch("/api/projects/x").catch(() => {});
      });
    }
    expect(latest?.lost).toBe(false);
    // Requests to other origins never count.
    await act(async () => {
      await window.fetch("https://cdn.example.com/a.js").catch(() => {});
    });
    expect(latest?.lost).toBe(false);
    await act(async () => {
      await window.fetch("/api/projects/x").catch(() => {});
    });
    expect(latest?.lost).toBe(true);
    expect(probe).toHaveBeenCalled();
  });
});
