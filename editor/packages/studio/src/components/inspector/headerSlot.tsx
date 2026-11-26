// The inspector card's title row hosts the selected element's actions (St-Inspector-Element:
// hide, copy, ungroup, clear). Panels render them into this slot with a portal; without a
// slot (tests, other hosts) they render inline.
import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { InspectorHeaderSlotContext } from "./inspectorHeaderSlot";

// Re-exported so existing imports from this module keep resolving.
export {
  HEADER_ICON_BUTTON,
  InspectorHeaderSlotContext,
  InspectorTitleContext,
  useInspectorTitle,
} from "./inspectorHeaderSlot";

export function InspectorHeaderActions({
  children,
  fallback,
}: {
  children: ReactNode;
  /** Rendered in place when no inspector card hosts the actions. */
  fallback: ReactNode;
}) {
  const slot = useContext(InspectorHeaderSlotContext);
  return slot ? createPortal(children, slot) : fallback;
}
