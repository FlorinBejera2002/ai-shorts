// Context and hook behind the inspector card's title row slot (see headerSlot.tsx). Kept out of
// the component file so Fast Refresh can preserve the panels' state.
import { createContext, useContext, useEffect } from "react";

export const InspectorHeaderSlotContext = createContext<HTMLElement | null>(null);

/** 32px round icon action for the inspector title row. */
export const HEADER_ICON_BUTTON =
  "inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]";

/** Lets a panel name the inspector card ("3 cuvinte" in captions mode). */
export const InspectorTitleContext = createContext<((title: string | null) => void) | null>(null);

export function useInspectorTitle(title: string | null) {
  const setTitle = useContext(InspectorTitleContext);
  // eslint-disable-next-line no-restricted-syntax -- publishes the title to the card header
  useEffect(() => {
    if (!setTitle) return;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
}
