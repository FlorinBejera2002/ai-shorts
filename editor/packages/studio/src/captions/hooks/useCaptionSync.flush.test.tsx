// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCaptionStore } from "../store";
import { DEFAULT_ANIMATION_SET, type CaptionModel } from "../types";
import { useCaptionSync } from "./useCaptionSync";

vi.mock("../../telemetry/client", () => ({ trackEvent: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const model = (): CaptionModel => ({
  width: 640,
  height: 360,
  duration: 3,
  segments: new Map(),
  groups: new Map(),
  groupOrder: [],
  defaultAnimation: DEFAULT_ANIMATION_SET,
});

async function mount() {
  const captured: { current?: ReturnType<typeof useCaptionSync> } = {};
  function Probe() {
    captured.current = useCaptionSync("project");
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  if (!captured.current) throw new Error("Hook not mounted");
  useCaptionStore.setState({ isEditMode: true, sourceFilePath: "index.html", model: model() });
  return { handle: captured.current, close: () => act(async () => root.unmount()) };
}

afterEach(() => {
  useCaptionStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("caption save barrier", () => {
  it("flushes the debounce and waits for the actual response", async () => {
    let resolve: (value: Response) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const mounted = await mount();
    try {
      let saved = false;
      const pending = mounted.handle.flush().then(() => {
        saved = true;
      });
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(saved).toBe(false);
      resolve(new Response("", { status: 200 }));
      await pending;
      expect(saved).toBe(true);
      await mounted.handle.flush();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      await mounted.close();
    }
  });

  it("rejects a failed save and allows an explicit successful retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 409 }))
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const mounted = await mount();
    try {
      await expect(mounted.handle.flush()).rejects.toThrow("couldn't be saved");
      expect(useCaptionStore.getState().syncError).toBeTruthy();
      await mounted.handle.flush();
      expect(useCaptionStore.getState().syncError).toBeNull();
    } finally {
      await mounted.close();
    }
  });

  it("serializes overlapping saves and waits for the final queued write", async () => {
    const responses: Array<(value: Response) => void> = [];
    const fetcher = vi.fn(() => new Promise<Response>((done) => responses.push(done)));
    vi.stubGlobal("fetch", fetcher);
    const mounted = await mount();
    try {
      const first = mounted.handle.save();
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      useCaptionStore.setState({ model: model() });
      const second = mounted.handle.save();
      let flushed = false;
      const pending = mounted.handle.flush().then(() => {
        flushed = true;
      });
      await Promise.resolve();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(flushed).toBe(false);
      responses[0](new Response("", { status: 200 }));
      await first;
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
      expect(flushed).toBe(false);
      responses[1](new Response("", { status: 200 }));
      await second;
      await pending;
      expect(flushed).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await mounted.close();
    }
  });
});
