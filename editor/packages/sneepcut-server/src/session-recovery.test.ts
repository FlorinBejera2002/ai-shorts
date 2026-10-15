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
        location: {
          hash,
          replace: (url: string) => {
            destination = url;
          },
        },
      });
      expect(destination).toBe(`https://app.sneepcut.test/dashboard/studio${expected}`);
    }
    expect(html).not.toContain("token");
  });

  it("opts in only the HTML served by the authenticated host", () => {
    expect(enableStudioSessionRenewal("<html><head></head><body></body></html>")).toContain(
      '<meta name="sneepcut-session" content="enabled">',
    );
  });
});
