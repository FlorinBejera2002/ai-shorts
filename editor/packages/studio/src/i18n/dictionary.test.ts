import { describe, expect, it } from "vitest";
import { messages, messagesEn, messagesRo } from "./dictionary";
import { formatMessage, resolveStudioLocale, translate } from "./translate";

describe("Studio dictionaries", () => {
  it("has identical keys in English and Romanian", () => {
    expect(Object.keys(messagesRo).sort()).toEqual(Object.keys(messagesEn).sort());
  });

  it("has no empty translations", () => {
    for (const locale of ["en", "ro"] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value.trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("uses Romanian diacritics and the board copy", () => {
    expect(messagesRo["shell.saveFailed"]).toBe("Salvare eșuată");
    expect(messagesRo["shell.export"]).toBe("Exportă");
    expect(messagesRo["shell.back"]).toBe("Clipuri");
    expect(messagesRo["shell.preview"]).toBe("Previzualizare");
    expect(messagesRo["agent.greeting"]).toBe("Salut! Cu ce te ajutăm?");
  });
});

describe("locale resolution", () => {
  it("prefers the lang parameter, then the browser language, then English", () => {
    expect(resolveStudioLocale("?lang=en", "ro-RO")).toBe("en");
    expect(resolveStudioLocale("?lang=ro", "en-US")).toBe("ro");
    expect(resolveStudioLocale("?lang=fr", "ro-RO")).toBe("ro");
    expect(resolveStudioLocale("", "ro-RO")).toBe("ro");
    expect(resolveStudioLocale("", "de-DE")).toBe("en");
  });
});

describe("translation", () => {
  it("interpolates named parameters and keeps unknown placeholders", () => {
    expect(formatMessage("Hello {name}", { name: "Ana" })).toBe("Hello Ana");
    expect(formatMessage("Hello {name} {missing}", { name: "Radu" })).toBe("Hello Radu {missing}");
  });

  it("translates with the requested locale", () => {
    expect(translate("ro", "shell.undo")).toBe("Anulează");
    expect(translate("en", "shell.undo")).toBe("Undo");
  });
});
