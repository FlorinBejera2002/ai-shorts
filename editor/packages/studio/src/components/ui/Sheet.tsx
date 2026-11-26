import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../i18n/translate";
import { PillButton } from "./PillButton";
import { useDialogBehavior } from "./useDialogBehavior";

// Bottom sheet for phone inspectors: 28px top radius, grab handle, title and a "Gata" action.
export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, title, onClose, children }: SheetProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ open, onClose, containerRef });
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end bg-[var(--st-ov)]">
      {/* Tapping the scrim closes the sheet; keyboard users close it with Escape instead. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full flex-col gap-4 overflow-hidden rounded-t-sheet bg-studio-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-studio outline-none"
      >
        <div aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-[var(--st-hd)]" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-studio-text">{title}</h2>
          <PillButton variant="ghost" size="sm" onClick={onClose}>
            {t("common.done")}
          </PillButton>
        </div>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
