import { describe, expect, it } from "bun:test";
import { runInNewContext } from "node:vm";
import { enableStudioSessionRenewal, sessionRecoveryDocument } from "./session-recovery";

describe("expired Studio navigation", () => {
  it("returns through the trusted launcher, preserving only a safe project identifier", () => {
    const html = sessionRecoveryDocument("https://app.sneepcut.test");
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    for (const [hash, expected] of [
      ["#project/owned_123", "?project=owned_123"],
      ["#project/owned_123?file=scene.html", "?project=owned_123"],
      ["#project/../../escape", ""],
      ["#project/evil<script>", ""],
      ["#https://evil.test", ""],
    ]) {
      let destination = "";
      runInNewContext(script ?? "", {
        URL,
        URLSearchParams,
        location: {
          hash,
          search: "",
          replace: (url: string) => {
            destination = url;
          },
        },
      });
      expect(destination).toBe(`https://app.sneepcut.test/dashboard/studio${expected}`);
    }
    expect(html).not.toContain("token");
  });

  it("returns to the Romanian dashboard when Studio was opened in Romanian", () => {
    const script = sessionRecoveryDocument("https://app.sneepcut.test").match(
      /<script>([\s\S]*?)<\/script>/,
    )?.[1];
    for (const [search, expected] of [
      ["?lang=ro", "https://app.sneepcut.test/ro/dashboard/studio?project=owned_123"],
      ["?lang=en", "https://app.sneepcut.test/dashboard/studio?project=owned_123"],
      ["?lang=fr", "https://app.sneepcut.test/dashboard/studio?project=owned_123"],
    ]) {
      let destination = "";
      runInNewContext(script ?? "", {
        URL,
        URLSearchParams,
        location: {
          hash: "#project/owned_123",
          search,
          replace: (url: string) => (destination = url),
        },
      });
      expect(destination).toBe(expected);
    }
  });

  it("opts in only the HTML served by the authenticated host", () => {
    expect(enableStudioSessionRenewal("<html><head></head><body></body></html>")).toContain(
      '<meta name="sneepcut-session" content="enabled">',
    );
  });
});
