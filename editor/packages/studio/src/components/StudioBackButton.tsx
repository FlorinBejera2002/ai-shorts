import { useState } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import { useEdgeSwipeBack } from "../hooks/useEdgeSwipeBack";

function canReturnToApp(): boolean {
  if (typeof document === "undefined") return false;
  const hosted = document.querySelector('meta[name="sneepcut-session"][content="enabled"]');
  return Boolean(hosted) && window.history.length > 1;
}

/** Below `lg`, where this button replaces the logo. */
function isSmallScreen(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

const goBack = () => window.history.back();

/**
 * Small-screen way back to the SneepCut app, which opens Studio in the same tab.
 * Wide layouts show the logo instead, so this renders below `lg` only. An edge swipe
 * from the left does the same, as on iOS.
 */
export function StudioBackButton() {
  const [visible] = useState(canReturnToApp);
  const [small] = useState(isSmallScreen);
  useEdgeSwipeBack(goBack, visible && small);
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-50 active:scale-[0.98] lg:hidden"
    >
      <CaretLeft size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}
