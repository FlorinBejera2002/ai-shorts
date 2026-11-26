import { afterEach, describe, expect, it } from "vitest";
import { messagesEn, messagesRo } from "../../i18n/dictionary";
import { setStudioLocale } from "../../i18n/translate";
import { clipsUrlFromReferrer } from "../StudioBackButton";
import { historyTooltip } from "./HistoryButtons";
import { RAIL_ITEMS, railItem, railItemForTab } from "./railItems";
import { railForPhoneTool } from "./phoneToolRail";
import { getSaveStatus, resetSaveStatus, trackProjectSave } from "./saveStatus";
import { normalizeProjectTitle } from "./useProjectTitle";

afterEach(() => {
  resetSaveStatus();
  setStudioLocale("en");
});

describe("save status", () => {
  it("reads saving while a write is in flight, then saved", async () => {
    let finish: () => void = () => {};
    const write = trackProjectSave(() => new Promise<void>((resolve) => (finish = resolve)));
    expect(getSaveStatus()).toBe("saving");
    finish();
    await write;
    expect(getSaveStatus()).toBe("saved");
  });

  it("reads failed after a failed write until the next write succeeds", async () => {
    await expect(trackProjectSave(() => Promise.reject(new Error("409")))).rejects.toThrow("409");
    expect(getSaveStatus()).toBe("failed");
    await trackProjectSave(() => Promise.resolve());
    expect(getSaveStatus()).toBe("saved");
  });
});

describe("project title", () => {
  it("accepts 1 to 120 characters and collapses whitespace", () => {
    expect(normalizeProjectTitle("  Interviu   Mara ")).toBe("Interviu Mara");
    expect(normalizeProjectTitle("x".repeat(120))).toHaveLength(120);
  });

  it("rejects an empty or too long title", () => {
    expect(normalizeProjectTitle("   ")).toBeNull();
    expect(normalizeProjectTitle("x".repeat(121))).toBeNull();
  });
});

describe("back link", () => {
  it("returns to the clips page of the app that opened Studio", () => {
    expect(
      clipsUrlFromReferrer(
        "https://sneepcut.com/dashboard/clips/abc",
        "https://studio.sneepcut.com",
      ),
    ).toBe("https://sneepcut.com/dashboard/clips");
  });

  it("ignores a missing, same-origin or non-web referrer", () => {
    expect(clipsUrlFromReferrer("", "https://studio.sneepcut.com")).toBeNull();
    expect(
      clipsUrlFromReferrer("https://studio.sneepcut.com/x", "https://studio.sneepcut.com"),
    ).toBeNull();
    expect(clipsUrlFromReferrer("file:///tmp/a.html", "https://studio.sneepcut.com")).toBeNull();
  });
});

describe("undo and redo tooltips", () => {
  it("names the action in Romanian", () => {
    setStudioLocale("ro");
    expect(historyTooltip("undo", "Mută clipul")).toMatch(/^Anulează Mută clipul \(.+Z\)$/);
    expect(historyTooltip("redo", null)).toMatch(/^Refă \(.+Shift\+Z\)$/);
  });
});

describe("rail", () => {
  it("opens the subtitles panel from the phone Subtitrări tool, not Media", () => {
    expect(railForPhoneTool("subtitles")).toBe("subtitles");
    expect(railItem("subtitles").tab).toBe("subtitles");
    expect(railForPhoneTool("edit")).toBeNull();
    expect(railForPhoneTool("more")).toBeNull();
  });

  it("lists the seven board entries, with Avansat last", () => {
    expect(RAIL_ITEMS.map((item) => item.id)).toEqual([
      "media",
      "text",
      "subtitles",
      "audio",
      "elements",
      "layers",
      "advanced",
    ]);
  });

  it("keeps the chosen item when it already shows the tab, else maps the tab", () => {
    expect(railItemForTab("text", "text")).toBe("text");
    expect(railItemForTab("compositions")).toBe("advanced");
    expect(railItemForTab("layers")).toBe("layers");
    expect(railItemForTab("blocks", "media")).toBe("elements");
    expect(railItemForTab("code")).toBe("advanced");
    expect(railItemForTab("assets")).toBe("media");
  });

  it("has Romanian copy for every shell key", () => {
    const shellKeys = (messages: Record<string, string>) =>
      Object.entries(messages)
        .filter(([key, value]) => key.startsWith("shell.") && value.trim())
        .map(([key]) => key);
    expect(shellKeys(messagesRo)).toEqual(shellKeys(messagesEn));
    expect(messagesRo["shell.tabEdit"]).toBe("Editare");
    expect(messagesRo["shell.saving"]).toBe("Se salvează…");
  });
});
