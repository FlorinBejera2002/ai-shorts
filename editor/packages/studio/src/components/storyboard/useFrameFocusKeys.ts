import { useEffect } from "react";
import { isTypingTarget } from "../../utils/typingTarget";

interface FrameFocusKeysOptions {
  frameIndex: number;
  frameCount: number;
  onBack: () => void;
  onNavigate: (delta: number) => void;
}

/** ←/→ navigate frames, Esc returns to the Board — but never while typing in a field. */
export function useFrameFocusKeys({
  frameIndex,
  frameCount,
  onBack,
  onNavigate,
}: FrameFocusKeysOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === "Escape") onBack();
      else if (e.key === "ArrowLeft" && frameIndex > 1) onNavigate(-1);
      else if (e.key === "ArrowRight" && frameIndex < frameCount) onNavigate(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
