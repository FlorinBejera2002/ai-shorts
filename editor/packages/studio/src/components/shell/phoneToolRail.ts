import type { PhoneToolId } from "./PhoneToolBar";
import type { RailItemId } from "./railItems";

const TOOL_RAIL: Partial<Record<PhoneToolId, RailItemId>> = {
  text: "text",
  audio: "audio",
  elements: "elements",
  subtitles: "subtitles",
};

/** Side panel rail item a phone tool opens as a sheet (edit and more have none). */
export function railForPhoneTool(id: PhoneToolId): RailItemId | null {
  return TOOL_RAIL[id] ?? null;
}
