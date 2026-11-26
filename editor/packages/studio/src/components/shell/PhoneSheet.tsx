// Phone bottom sheet (St-M-ClipSheet): scrim over the whole editor, 28px top radius, grab
// handle, title and a black "Gata" pill. Children stay mounted only while it is open.
import { useRef, type ReactNode } from "react";
import { t, useLocale } from "../../i18n/translate";
import { useDialogBehavior } from "../ui/useDialogBehavior";

export interface PhoneSheetProps {
  open: boolean;
  onClose: () => void;
  /** Title and "Gata" row. Omit when the content brings its own header (the inspector). */
  title?: string;
  closeLabel?: string;
  /** Fixed height for editors that fill the sheet (side panel, inspector). */
  tall?: boolean;
  children: ReactNode;
}

export const SHEET_LAYER = "z-[150]";

export function PhoneSheet({ open, onClose, title, closeLabel, tall, children }: PhoneSheetProps) {
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ open, onClose, containerRef });
  if (!open) return null;
  return (
    <div className={`fixed inset-0 ${SHEET_LAYER} flex items-end bg-[var(--st-ov)]`}>
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
        aria-label={title ?? t("shell.inspector")}
        tabIndex={-1}
        className={`relative flex w-full flex-col overflow-hidden rounded-t-sheet bg-studio-surface pb-[max(12px,env(safe-area-inset-bottom))] pt-2 shadow-studio outline-none ${
          tall ? "h-[min(600px,78dvh)]" : "max-h-[85dvh]"
        }`}
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-2 h-1 w-10 flex-none rounded-full bg-[var(--st-hd)]"
        />
        {title && (
          <div className="flex flex-none items-center justify-between gap-3 px-4 pb-3 pt-1">
            <h2 className="font-display text-[17px] font-semibold leading-6 text-studio-text">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-none rounded-full bg-studio-accent px-5 text-[13px] font-semibold text-studio-on-accent active:scale-[0.98]"
            >
              {closeLabel ?? t("common.done")}
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
