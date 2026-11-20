import { useState } from "react";
import { CaretLeft } from "@phosphor-icons/react";

function canReturnToApp(): boolean {
  if (typeof document === "undefined") return false;
  const hosted = document.querySelector('meta[name="sneepcut-session"][content="enabled"]');
  return Boolean(hosted) && window.history.length > 1;
}

/**
 * Small-screen way back to the SneepCut app, which opens Studio in the same tab.
 * Wide layouts show the logo instead, so this renders below `lg` only.
 */
export function StudioBackButton() {
  const [visible] = useState(canReturnToApp);
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      aria-label="Back"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-50 active:scale-[0.98] lg:hidden"
    >
      <CaretLeft size={18} weight="bold" aria-hidden="true" />
    </button>
  );
}
