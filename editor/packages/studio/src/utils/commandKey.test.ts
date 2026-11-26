// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_KEY,
  OPTION_KEY,
  commandKeyLabel,
  modifierKeyLabel,
  optionKeyLabel,
} from "./commandKey";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubNavigator(info: { platform?: string; userAgentPlatform?: string }) {
  vi.stubGlobal("navigator", {
    platform: info.platform ?? "",
    userAgentData: info.userAgentPlatform ? { platform: info.userAgentPlatform } : undefined,
  });
}

describe("commandKeyLabel", () => {
  it("shows the Mac command symbol on Apple devices", () => {
    stubNavigator({ platform: "MacIntel" });
    expect(commandKeyLabel()).toBe("⌘");
  });

  it("prefers the client hints platform when present", () => {
    stubNavigator({ platform: "Win32", userAgentPlatform: "macOS" });
    expect(commandKeyLabel()).toBe("⌘");
  });

  it("shows Ctrl on Windows and Linux", () => {
    stubNavigator({ platform: "Win32" });
    expect(commandKeyLabel()).toBe("Ctrl");
    stubNavigator({ platform: "Linux x86_64" });
    expect(commandKeyLabel()).toBe("Ctrl");
  });
});

describe("modifier key labels", () => {
  it("names the option modifier Alt on Windows and ⌥ on Apple devices", () => {
    stubNavigator({ platform: "Win32" });
    expect(optionKeyLabel()).toBe("Alt");
    stubNavigator({ platform: "MacIntel" });
    expect(optionKeyLabel()).toBe("⌥");
  });

  it("maps the modifier stand-ins and leaves other key caps unchanged", () => {
    stubNavigator({ platform: "Win32" });
    expect(modifierKeyLabel(COMMAND_KEY)).toBe("Ctrl");
    expect(modifierKeyLabel(OPTION_KEY)).toBe("Alt");
    expect(modifierKeyLabel("⇧")).toBe("⇧");
    stubNavigator({ platform: "MacIntel" });
    expect(modifierKeyLabel(COMMAND_KEY)).toBe("⌘");
    expect(modifierKeyLabel(OPTION_KEY)).toBe("⌥");
  });
});
