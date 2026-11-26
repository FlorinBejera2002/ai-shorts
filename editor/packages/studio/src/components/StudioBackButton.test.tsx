// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setStudioLocale } from "../i18n/translate";
import { resetStudioSessionInfoRequest } from "../utils/studioSessionRenewal";
import { StudioBackButton } from "./StudioBackButton";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SESSION_INFO = {
  userId: "11111111-2222-3333-4444-555555555555",
  appOrigin: "https://sneepcut.com",
};

let root: Root | null = null;

beforeEach(() => {
  resetStudioSessionInfoRequest();
  document.head.innerHTML = '<meta name="sneepcut-session" content="enabled">';
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(SESSION_INFO), { status: 200 })),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
  setStudioLocale("en");
});

async function renderBackButton(variant: "desktop" | "phone") {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StudioBackButton variant={variant} />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return host.querySelector<HTMLAnchorElement>("a");
}

describe("StudioBackButton", () => {
  it("links to the English clips page of the app that opened Studio", async () => {
    setStudioLocale("en");
    const link = await renderBackButton("desktop");
    expect(link?.getAttribute("href")).toBe("https://sneepcut.com/dashboard/clips");
  });

  it("links to the Romanian clips page when Studio runs in Romanian", async () => {
    setStudioLocale("ro");
    const link = await renderBackButton("phone");
    expect(link?.getAttribute("href")).toBe("https://sneepcut.com/ro/dashboard/clips");
  });

  it("renders nothing when no app origin is known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const link = await renderBackButton("desktop");
    expect(link).toBeNull();
  });
});
