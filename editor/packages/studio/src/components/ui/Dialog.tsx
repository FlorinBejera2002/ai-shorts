import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "../../i18n/translate";
import { useDialogBehavior } from "./useDialogBehavior";

// Centred dialog with a 28px radius, scrim and title. Escape and backdrop close it.
export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  canClose?: () => boolean;
}

export function Dialog({ open, title, onClose, children, footer, canClose }: DialogProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const requestClose = () => {
    if (canClose && !canClose()) return;
    onClose();
  };
  useDialogBehavior({ open, onClose, containerRef, canClose });
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[var(--st-ov)] p-4">
      {/* Clicking the scrim closes the dialog; keyboard users close it with Escape instead. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={requestClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex w-full max-w-md flex-col gap-5 rounded-sheet bg-studio-surface p-6 shadow-studio outline-none"
      >
        <h2 className="font-display text-lg font-semibold text-studio-text">{title}</h2>
        <div className="text-sm text-studio-text">{children}</div>
        {footer ? <div className="flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
