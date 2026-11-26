// Closes a popup on Escape or on a pointer press outside its trigger and panel.
import { useEffect, type RefObject } from "react";

export function useDismissOnOutside(
  open: boolean,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
) {
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && refs.some((ref) => ref.current?.contains(target))) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, refs, onDismiss]);
}
