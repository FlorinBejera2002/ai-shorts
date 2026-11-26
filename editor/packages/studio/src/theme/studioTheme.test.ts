import { describe, expect, it } from "vitest";
import {
  initStudioTheme,
  originOf,
  resolveStudioTheme,
  themeFromMessage,
  themeFromSearch,
  type StudioThemeEnvironment,
} from "./studioTheme";

describe("theme resolution", () => {
  it("reads only a valid theme from the query string", () => {
    expect(themeFromSearch("?theme=dark")).toBe("dark");
    expect(themeFromSearch("?theme=light&lang=ro")).toBe("light");
    expect(themeFromSearch("?theme=purple")).toBeNull();
    expect(themeFromSearch("")).toBeNull();
  });

  it("prefers the query, then the embedder message, then the system scheme", () => {
    expect(resolveStudioTheme({ query: "light", message: "dark", systemPrefersDark: true })).toBe(
      "light",
    );
    expect(resolveStudioTheme({ query: null, message: "dark", systemPrefersDark: false })).toBe(
      "dark",
    );
    expect(resolveStudioTheme({ query: null, message: null, systemPrefersDark: true })).toBe(
      "dark",
    );
    expect(resolveStudioTheme({ query: null, message: null, systemPrefersDark: false })).toBe(
      "light",
    );
  });

  it("accepts a theme message only from the referrer origin", () => {
    const data = { type: "sneepcut:theme", theme: "dark" };
    expect(themeFromMessage(data, "https://sneepcut.com", "https://sneepcut.com")).toBe("dark");
    expect(themeFromMessage(data, "https://evil.example", "https://sneepcut.com")).toBeNull();
    expect(themeFromMessage(data, "https://sneepcut.com", null)).toBeNull();
    expect(
      themeFromMessage(
        { type: "other", theme: "dark" },
        "https://sneepcut.com",
        "https://sneepcut.com",
      ),
    ).toBeNull();
    expect(
      themeFromMessage(
        { type: "sneepcut:theme", theme: "blue" },
        "https://sneepcut.com",
        "https://sneepcut.com",
      ),
    ).toBeNull();
  });

  it("parses the referrer origin safely", () => {
    expect(originOf("https://sneepcut.com/clips?x=1")).toBe("https://sneepcut.com");
    expect(originOf("")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});

function fakeEnvironment(overrides: Partial<StudioThemeEnvironment> = {}) {
  const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
  let messageListener: ((event: MessageEvent) => void) | undefined;
  let systemListener: (() => void) | undefined;
  let systemDark = false;
  const environment: StudioThemeEnvironment = {
    search: "",
    referrer: "https://sneepcut.com/app",
    systemPrefersDark: () => systemDark,
    addMessageListener: (listener) => {
      messageListener = listener;
      return () => (messageListener = undefined);
    },
    subscribeSystem: (listener) => {
      systemListener = listener;
      return () => (systemListener = undefined);
    },
    root,
    ...overrides,
  };
  return {
    environment,
    root,
    post(data: unknown, origin: string) {
      messageListener?.({ data, origin } as MessageEvent);
    },
    setSystemDark(value: boolean) {
      systemDark = value;
      systemListener?.();
    },
  };
}

describe("initStudioTheme", () => {
  it("applies the theme once and updates on message without a reload", () => {
    const fake = fakeEnvironment();
    const dispose = initStudioTheme(fake.environment);
    expect(fake.root.dataset.theme).toBe("light");
    fake.post({ type: "sneepcut:theme", theme: "dark" }, "https://sneepcut.com");
    expect(fake.root.dataset.theme).toBe("dark");
    fake.post({ type: "sneepcut:theme", theme: "dark" }, "https://other.example");
    fake.setSystemDark(false);
    expect(fake.root.dataset.theme).toBe("dark");
    dispose();
  });

  it("keeps the query theme over later messages and system changes", () => {
    const fake = fakeEnvironment({ search: "?theme=light" });
    initStudioTheme(fake.environment);
    fake.post({ type: "sneepcut:theme", theme: "dark" }, "https://sneepcut.com");
    fake.setSystemDark(true);
    expect(fake.root.dataset.theme).toBe("light");
  });
});
