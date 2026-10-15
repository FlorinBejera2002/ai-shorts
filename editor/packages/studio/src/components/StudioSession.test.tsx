// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioSession } from "./StudioSession";
import { readStudioSessionInfo } from "../utils/studioSessionRenewal";

const owner = "11111111-1111-4111-8111-111111111111";
const appOrigin = "https://app.sneepcut.test";
const info = { userId: owner, appOrigin };

function fromFrame(
  frame: HTMLIFrameElement,
  data: unknown,
  origin = appOrigin,
  source = frame.contentWindow,
) {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}

describe("native Studio session", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Keep a real frame window without networking; the browser test covers its document.
    vi.spyOn(HTMLIFrameElement.prototype, "setAttribute").mockImplementation(
      function (this: HTMLIFrameElement, name, value) {
        Element.prototype.setAttribute.call(this, name, name === "src" ? "about:blank" : value);
      },
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(info)),
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    document.querySelector('meta[name="sneepcut-session"]')?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function renderNative() {
    const marker = document.createElement("meta");
    marker.name = "sneepcut-session";
    marker.content = "enabled";
    document.head.append(marker);
    await act(async () =>
      root.render(
        <>
          <textarea defaultValue="Pending unsaved composition" />
          <StudioSession />
        </>,
      ),
    );
    const frame = container.querySelector("iframe");
    if (!frame?.contentWindow) throw new Error("Missing authentication bridge");
    return frame;
  }

  it("does not contact SneepCut authentication in upstream Studio", async () => {
    await act(async () => root.render(<StudioSession />));
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("validates trusted configuration and refuses URLs with credentials or paths", () => {
    expect(readStudioSessionInfo(info)).toEqual(info);
    expect(readStudioSessionInfo({ ...info, appOrigin: "http://localhost:3000" })?.appOrigin).toBe(
      "http://localhost:3000",
    );
    for (const origin of [
      "http://app.sneepcut.test",
      "https://user:secret@app.sneepcut.test",
      "https://app.sneepcut.test/path",
      "https://app.sneepcut.test?token=x",
      "javascript:alert(1)",
    ]) {
      expect(readStudioSessionInfo({ ...info, appOrigin: origin })).toBeNull();
    }
  });

  it("renews periodically only after the expected frame handshake and ignores forged replies", async () => {
    const frame = await renderNative();
    if (!frame.contentWindow) throw new Error("Missing frame window");
    const send = vi.spyOn(frame.contentWindow, "postMessage").mockImplementation(() => {});
    fromFrame(frame, { type: "sneepcut:session-bridge-ready" }, "https://evil.test");
    fromFrame(frame, { type: "sneepcut:session-bridge-ready" }, appOrigin, window);
    expect(send).not.toHaveBeenCalled();
    fromFrame(frame, { type: "sneepcut:session-bridge-ready" });
    expect(send).toHaveBeenCalledTimes(1);
    const request = send.mock.calls[0]?.[0];
    expect(request).toMatchObject({ type: "sneepcut:renew-session", userId: owner });
    expect(send.mock.calls[0]?.[1]).toBe(appOrigin);
    await act(async () => {
      fromFrame(frame, { type: "sneepcut:session-result", requestId: "wrong-request", ok: true });
      vi.advanceTimersByTime(45000);
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(5 * 60000 - 45000));
    expect(send).toHaveBeenCalledTimes(2);
    await act(async () =>
      fromFrame(frame, {
        type: "sneepcut:session-result",
        requestId: send.mock.calls[1]?.[0].requestId,
        ok: true,
      }),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("retries a failed frame without replacing the editor DOM or its unsaved draft", async () => {
    const first = await renderNative();
    const editor = container.querySelector("textarea");
    if (!editor) throw new Error("Missing editor fixture");
    editor.value = "The in-progress edit stays here";
    await act(async () => vi.advanceTimersByTime(45000));
    expect(container.textContent).toContain("Keep this tab open");
    await act(async () => container.querySelector("button")?.click());
    const retry = container.querySelector("iframe");
    if (!retry?.contentWindow) throw new Error("Missing retry bridge");
    expect(retry).not.toBe(first);
    const send = vi.spyOn(retry.contentWindow, "postMessage").mockImplementation(() => {});
    fromFrame(retry, { type: "sneepcut:session-bridge-ready" });
    await act(async () =>
      fromFrame(retry, {
        type: "sneepcut:session-result",
        requestId: send.mock.calls[0]?.[0].requestId,
        ok: true,
      }),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("The in-progress edit stays here");
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});
