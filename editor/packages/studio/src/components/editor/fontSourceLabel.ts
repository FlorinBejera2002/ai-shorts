// Labels for the font source badges (Google, Local, Sistem, Importat).
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";

const FONT_SOURCE_KEYS: Partial<Record<string, MessageKey>> = {
  Google: "font.source.google",
  Local: "font.source.local",
  System: "font.source.system",
  Imported: "font.source.imported",
  Current: "font.source.current",
  Document: "font.source.document",
};

export function fontSourceLabel(source: string): string {
  const key = FONT_SOURCE_KEYS[source];
  return key ? t(key) : source;
}
