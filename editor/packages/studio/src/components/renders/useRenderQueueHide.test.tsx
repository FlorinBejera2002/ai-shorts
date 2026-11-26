// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountRenderQueue, type MountedQueue } from "./renderQueueTestHarness";

vi.mock("../../telemetry/events", () => ({ trackStudioRenderStart: vi.fn() }));

const { useRenderQueue } = await import("./useRenderQueue");

const HIDDEN_KEY = "hf-studio-hidden-renders:demo";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** History holds one finished file; the render POST starts job j1; cancel answers "cancelled". */
function stubServer(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/environment/ffmpeg")) return json({ ok: true });
      if (url.endsWith("/renders")) {
        return json({
          renders: [
            { id: "done1", filename: "done1.mp4", createdAt: 1, size: 10, status: "complete" },
          ],
        });
      }
      if (url.endsWith("/cancel")) return json({ status: "cancelled" });
      return json({ jobId: "j1", status: "rendering" });
    }),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      close(): void {}
      addEventListener(): void {}
    },
  );
}

let queue: MountedQueue | null = null;

beforeEach(() => {
  localStorage.clear();
  stubServer();
});

afterEach(() => {
  queue?.unmount();
  queue = null;
  vi.unstubAllGlobals();
});

describe("clearCompleted hides only renders that can be restored", () => {
  it("does not count a cancelled render as hidden, so Show hidden never promises a row it cannot bring back", async () => {
    queue = mountRenderQueue(useRenderQueue, "demo", null);
    await act(async () => {
      await queue?.api().startRender({});
    });
    await act(async () => {
      await queue?.api().reloadRenders();
    });
    await act(async () => {
      await queue?.api().cancelRender("j1");
    });
    expect(queue.api().jobs.map((j) => [j.id, j.status])).toEqual(
      expect.arrayContaining([
        ["j1", "cancelled"],
        ["done1", "complete"],
      ]),
    );

    act(() => queue?.api().clearCompleted());

    expect(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]")).toEqual(["done1"]);
    expect(queue.api().hiddenCount).toBe(1);
  });

  it("keeps a cancelled render visible after Hide, since nothing can bring it back", async () => {
    queue = mountRenderQueue(useRenderQueue, "demo", null);
    await act(async () => {
      await queue?.api().startRender({});
    });
    await act(async () => {
      await queue?.api().cancelRender("j1");
    });

    expect(queue.api().hideableCount).toBe(1);
    act(() => queue?.api().clearCompleted());

    expect(queue.api().jobs.map((j) => [j.id, j.status])).toEqual([["j1", "cancelled"]]);
    expect(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]")).toEqual(["done1"]);
    expect(queue.api().hiddenCount).toBe(1);
    expect(queue.api().hideableCount).toBe(0);
  });

  it("keeps a render that failed in this tab visible even when a partial file may remain on disk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/environment/ffmpeg")) return json({ ok: true });
        if (url.endsWith("/renders")) return json({ renders: [] });
        if (init?.method === "POST") throw new TypeError("network down");
        return json({});
      }),
    );
    queue = mountRenderQueue(useRenderQueue, "demo", null);
    await act(async () => {
      await queue?.api().startRender({});
    });
    expect(queue.api().jobs.map((j) => j.status)).toEqual(["failed"]);
    expect(queue.api().hideableCount).toBe(0);

    act(() => queue?.api().clearCompleted());

    expect(queue.api().jobs.map((j) => j.status)).toEqual(["failed"]);
    expect(localStorage.getItem(HIDDEN_KEY)).toBeNull();
    expect(queue.api().hiddenCount).toBe(0);
  });
});
