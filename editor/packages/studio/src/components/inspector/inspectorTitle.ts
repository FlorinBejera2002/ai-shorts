// The inspector card title follows what it shows (St-Main "Clip", St-Subtitles "Subtitrări",
// St-Multi "3 elemente", St-Inspector-Layers "Straturi", St-Empty "Inspector").
import { t } from "../../i18n/translate";
import type { RightPanelTab } from "../../utils/studioHelpers";
import type { DomEditSelection } from "../editor/domEditingTypes";

export interface InspectorTitleInput {
  captionEditMode: boolean;
  tab: RightPanelTab;
  inspectorTabActive: boolean;
  multiCount: number;
  selection: DomEditSelection | null;
}

const TAB_TITLES = {
  layers: "inspector.tabLayers",
  renders: "inspector.tabRenders",
  variables: "inspector.tabVariables",
  slideshow: "inspector.tabSlideshow",
  "block-params": "inspector.tabBlockParams",
} as const;

const MEDIA_TAGS = new Set(["video", "img", "audio"]);

/** A cut is "Clip", text is "Text", media keeps its own name, anything else is "Element". */
function selectionTitle(selection: DomEditSelection): string {
  if (selection.element.hasAttribute("data-source-window")) return t("cut.title");
  if (MEDIA_TAGS.has(selection.tagName.toLowerCase()))
    return selection.element.getAttribute("data-label") || selection.label || t("inspector.title");
  if (selection.textFields.length > 0) return t("flat.section.text");
  return t("inspector.element");
}

export function inspectorTitle({
  captionEditMode,
  tab,
  inspectorTabActive,
  multiCount,
  selection,
}: InspectorTitleInput): string {
  if (captionEditMode) return t("inspector.captionsTitle");
  if (tab !== "design") return t(TAB_TITLES[tab]);
  if (!inspectorTabActive) return t("inspector.title");
  if (multiCount > 1) return t("inspector.multiTitle", { n: multiCount });
  return selection ? selectionTitle(selection) : t("inspector.title");
}
