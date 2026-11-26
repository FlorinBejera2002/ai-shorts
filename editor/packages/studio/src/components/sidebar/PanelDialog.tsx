// Dialog for the left rail panels (St-Shell-AssetDelete, St-Shell-CodeDelete): 440px, 28px radius,
// Sora 20px title with a close button, footer actions on the right. On phone it is a bottom sheet
// (St-M-Shell-PhoneDelete) with "Închide" in the title row.
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogBehavior } from "../ui/useDialogBehavior";
import { illustrationSrc } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { useIsPhone } from "../shell/useIsPhone";
import { PanelIconButton, PanelPill } from "./panelKit";

export interface PanelDialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Width on desktop. Defaults to 440px. */
  width?: number;
}

export function PanelDialog({ title, onClose, children, footer, width = 440 }: PanelDialogProps) {
  useLocale();
  const isPhone = useIsPhone();
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ open: true, onClose, containerRef });
  return createPortal(
    <div
      role="presentation"
      className={`fixed inset-0 z-[150] flex bg-[var(--st-ov)] ${isPhone ? "items-end" : "items-center justify-center p-4"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={isPhone ? undefined : { width }}
        className={
          isPhone
            ? "flex max-h-[85vh] min-h-[440px] w-full flex-col gap-4 rounded-t-sheet bg-studio-surface px-4 pb-5 pt-2.5 text-studio-text shadow-[0_-12px_40px_rgba(21,32,53,.14)] outline-none"
            : "flex max-h-[85vh] max-w-full flex-col gap-5 rounded-sheet bg-studio-surface p-6 text-studio-text shadow-[0_30px_80px_rgba(21,32,53,.28)] outline-none"
        }
      >
        {isPhone ? (
          <span
            aria-hidden="true"
            className="mx-auto block h-1 w-10 flex-none rounded-full bg-[var(--st-hd)]"
          />
        ) : null}
        <div className="flex flex-none items-center gap-2">
          <h2
            className={`min-w-0 flex-1 font-display font-semibold ${isPhone ? "text-[17px] leading-6" : "text-xl leading-7"}`}
          >
            {title}
          </h2>
          {isPhone ? (
            <PanelPill size={44} variant="primary" onClick={onClose}>
              {t("common.close")}
            </PanelPill>
          ) : (
            <PanelIconButton icon="close" label={t("common.close")} size={36} onClick={onClose} />
          )}
        </div>
        <div
          className={`flex min-h-0 flex-col overflow-y-auto text-sm ${isPhone ? "flex-1 gap-4" : "gap-3.5"}`}
        >
          {children}
        </div>
        {footer ? (
          <div className={`flex flex-none gap-2 ${isPhone ? "[&>*]:flex-1" : "justify-end"}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Delete confirmation with the Ana și Radu delete illustration, used by every panel delete. */
export function DeleteConfirmDialog({
  title,
  message,
  phoneTitle,
  phoneMessage,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  /** Copy for the phone bottom sheet (St-M-Shell-PhoneDelete), when it differs from desktop. */
  phoneTitle?: string;
  phoneMessage?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useLocale();
  const isPhone = useIsPhone();
  const pillSize = isPhone ? 48 : 40;
  return (
    <PanelDialog
      title={isPhone && phoneTitle ? phoneTitle : title}
      onClose={onCancel}
      footer={
        <>
          <PanelPill size={pillSize} onClick={onCancel}>
            {t("media.cancel")}
          </PanelPill>
          <PanelPill size={pillSize} variant="danger" onClick={onConfirm}>
            {t("common.delete")}
          </PanelPill>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <img
          src={illustrationSrc("delete")}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={`object-contain ${isPhone ? "h-32 w-32" : "h-[132px] w-[132px]"}`}
        />
        <span className="text-center text-sm font-medium leading-5 [overflow-wrap:anywhere]">
          {isPhone && phoneMessage ? phoneMessage : message}
        </span>
      </div>
    </PanelDialog>
  );
}
