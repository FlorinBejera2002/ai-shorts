// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadStudioSessionInfo, resetStudioSessionInfoRequest } from "./studioSessionRenewal";

const info = { userId: "11111111-2222-4333-8444-555555555555", appOrigin: "https://app.test" };

beforeEach(() => {
  resetStudioSessionInfoRequest();
  document.head.innerHTML = '<meta name="sneepcut-session" content="enabled">';
});

afterEach(() => {
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("loadStudioSessionInfo", () => {
  it("shares one request between concurrent callers, with a timeout", async () => {
    const fetchStub = vi.fn(async () => Response.json(info));
    vi.stubGlobal("fetch", fetchStub);

    const [first, second] = await Promise.all([loadStudioSessionInfo(), loadStudioSessionInfo()]);

    expect(first).toEqual(info);
    expect(second).toEqual(info);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const init = fetchStub.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries after a failed request instead of caching the failure", async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(Response.json(info));
    vi.stubGlobal("fetch", fetchStub);

    await expect(loadStudioSessionInfo()).rejects.toThrow("Session unavailable");
    await expect(loadStudioSessionInfo()).resolves.toEqual(info);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("resolves to null without fetching when Studio is not hosted by SneepCut", async () => {
    document.head.innerHTML = "";
    const fetchStub = vi.fn(async () => Response.json(info));
    vi.stubGlobal("fetch", fetchStub);

    await expect(loadStudioSessionInfo()).resolves.toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
