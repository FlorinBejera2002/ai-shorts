import { t } from "../../i18n/translate";

export type RenderFormat = "mp4" | "webm" | "mov";

/** Labels are brand and codec names, so they stay the same in every locale. */
export const FORMAT_LABEL: Record<RenderFormat, string> = {
  mp4: "MP4",
  mov: "MOV (ProRes 4444)",
  webm: "WebM (VP9)",
};

export function formatDescription(format: RenderFormat): string {
  if (format === "mp4") return t("output.formatMp4Desc");
  if (format === "mov") return t("output.formatMovDesc");
  return t("output.formatWebmDesc");
}
