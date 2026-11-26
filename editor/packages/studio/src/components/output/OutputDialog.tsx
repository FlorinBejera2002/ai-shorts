// Dialog used by the export, renders, states and advanced boards. Desktop: centred card with a
// 28px radius, 20px Sora title and a close button. Phone: bottom sheet with a handle, a 17px
// title and a "Gata"/"Închide" pill, as on the St-M-* boards.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../i18n/translate";
import { useDialogBehavior } from "../ui/useDialogBehavior";
import { useIsPhone } from "../shell/useIsPhone";
import { OutputButton, OutputIconButton } from "./OutputButton";

export interface OutputDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** Desktop card width in px (boards use 400 to 600). */
  width?: number;
  /** Centre the title and the footer (states boards: crash, offline). */
  centred?: boolean;
  /** Hide the close button (the dialog closes only through its actions). */
  hideClose?: boolean;
  /** Label of the phone sheet's top-right pill. */
  doneLabel?: string;
  /** Action of that pill when it differs from closing (a dialog that cannot be closed). */
  onDone?: () => void;
  /** Phone pill style: outline "Închide" (default) or black "Gata" (St-M-Exported). */
  doneVariant?: "primary" | "secondary";
  /** alertdialog for errors that need an answer. */
  role?: "dialog" | "alertdialog";
  canClose?: () => boolean;
  /** Dark mode lifts the surface one step (--st-sub) above the scrim (export dialogs). */
  raised?: boolean;
  /** Extra hook for tests and screenshots. */
  testId?: string;
}

const RAISED = "[:root[data-theme=dark]_&]:bg-[var(--st-sub)]";

export function OutputDialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = 440,
  centred = false,
  hideClose = false,
  doneLabel,
  onDone,
  doneVariant = "secondary",
  role = "dialog",
  canClose,
  raised = false,
  testId,
}: OutputDialogProps) {
  useLocale();
  const isPhone = useIsPhone();
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ open, onClose, containerRef, canClose });
  // The shared behaviour focuses the first control, which paints its focus ring on a dialog that
  // opened by itself (offline, export done). Hold focus on the dialog instead: Tab still reaches
  // the first control, and the trap and focus restore stay with the shared hook.
  useEffect(() => {
    if (open) containerRef.current?.focus();
  }, [open]);
  if (!open) return null;
  const requestClose = () => {
    if (canClose && !canClose()) return;
    onClose();
  };
  const body = children ? <div className="flex min-h-0 flex-col gap-3.5">{children}</div> : null;

  if (isPhone) {
    return createPortal(
      <div
        role="presentation"
        className="fixed inset-0 z-[150] flex items-end bg-[var(--st-ov)]"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          ref={containerRef}
          role={role}
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          data-testid={testId}
          className="flex max-h-[88dvh] w-full flex-col gap-4 rounded-t-[28px] bg-studio-surface px-4 pt-2.5 pb-[max(20px,env(safe-area-inset-bottom))] text-studio-text shadow-studio outline-none"
        >
          <span
            aria-hidden="true"
            className="mx-auto block h-1 w-10 flex-none rounded-full bg-[var(--st-hd)]"
          />
          <div className="flex flex-none items-center gap-2">
            <h2 className="min-w-0 flex-1 font-display text-[17px] font-semibold leading-6">
              {title}
            </h2>
            {hideClose ? null : (
              <OutputButton variant={doneVariant} height={36} onClick={onDone ?? requestClose}>
                {doneLabel ?? t("common.close")}
              </OutputButton>
            )}
          </div>
          {body ? <div className="min-h-0 overflow-y-auto">{body}</div> : null}
          {footer ? <div className="flex flex-none gap-2 [&>*]:flex-1">{footer}</div> : null}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[var(--st-ov)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className={`flex max-h-[calc(100dvh-32px)] max-w-full flex-col gap-5 rounded-[28px] bg-studio-surface p-6 text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd),0_30px_80px_rgba(21,32,53,0.28)] outline-none ${raised ? RAISED : ""}`}
        style={{ width }}
      >
        <div className="flex items-center gap-2">
          <h2
            className={`min-w-0 flex-1 font-display text-xl font-semibold leading-7 ${centred ? "text-center" : ""}`}
          >
            {title}
          </h2>
          {hideClose || centred ? null : (
            <OutputIconButton
              icon="close"
              label={t("common.close")}
              size={36}
              iconSize={18}
              onClick={requestClose}
            />
          )}
        </div>
        {body ? <div className="min-h-0 overflow-y-auto">{body}</div> : null}
        {footer ? (
          <div className={`flex flex-wrap gap-2 ${centred ? "justify-center" : "justify-end"}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Centred illustration (from public/illustrations) with an optional bold caption. */
export function OutputIllustration({
  src,
  size,
  caption,
}: {
  src: string;
  size: number;
  caption?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        width={size}
        height={size}
        className="block flex-none object-contain"
        style={{ width: size, height: size }}
      />
      {caption ? <b className="text-sm font-semibold [overflow-wrap:anywhere]">{caption}</b> : null}
    </div>
  );
}
