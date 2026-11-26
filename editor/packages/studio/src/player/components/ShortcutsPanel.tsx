import { useState, useCallback, useId, useRef, memo, type RefObject } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../i18n/translate";
import { useMountEffect } from "../../hooks/useMountEffect";
import {
  DIALOG_SHADOW,
  PreviewIcon,
  OutlinePill,
  PreviewIconButton,
} from "../../components/nle/preview/previewChrome";
import { DESKTOP_SHORTCUT_ROWS } from "./transport/shortcutSections";
import { ShortcutSectionList } from "./transport/ShortcutList";
import {
  JumpToFrameSection,
  WorkAreaSection,
  type TransportToolsProps,
} from "./transport/TransportTools";

type ShortcutsPanelProps = TransportToolsProps;

/**
 * Focus the dialog's Escape may act on: inside the dialog, nothing (a control that removed
 * itself, such as Șterge on the in/out rows, drops focus to <body>), or the trigger. Focus
 * anywhere else belongs to another layer (a portal menu, a global overlay) that handles its own
 * Escape; closing the dialog too would dismiss two layers with one key.
 */
function isDialogOwnedFocus(
  active: Element | null,
  dialog: HTMLElement | null,
  trigger: HTMLElement | null,
): boolean {
  if (active === null || active === document.body || active === trigger) return true;
  return Boolean(dialog?.contains(active));
}

/** Closes the dialog on Escape (see isDialogOwnedFocus) or on a press outside the panel. */
function useShortcutsDialogDismiss(
  dialogRef: RefObject<HTMLDialogElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
  onClose: () => void,
) {
  useMountEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!isDialogOwnedFocus(document.activeElement, dialogRef.current, triggerRef.current)) {
        return;
      }
      event.preventDefault();
      onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (panelRef.current?.contains(target) || triggerRef.current?.contains(target))) {
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  });
}

interface ShortcutsDialogProps extends TransportToolsProps {
  dialogId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

/**
 * Modal `<dialog>` body. It opens with showModal() on mount (focus trap and Escape come from the
 * dialog), moves focus into the panel, and hands focus back to the trigger on unmount.
 */
function ShortcutsDialog({ dialogId, triggerRef, onClose, ...transport }: ShortcutsDialogProps) {
  const [view, setView] = useState<"tools" | "shortcuts">("tools");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    dialogRef.current?.showModal();
    panelBodyRef.current?.focus();
    return () => triggerRef.current?.focus();
  });
  useShortcutsDialogDismiss(dialogRef, panelBodyRef, triggerRef, onClose);

  // The dialog element is the full-viewport scrim; the panel inside is the visible sheet.
  return (
    <dialog
      id={dialogId}
      ref={dialogRef}
      aria-modal="true"
      aria-label={t("preview.shortcutsAndTools")}
      onClose={onClose}
      className="fixed inset-0 z-[150] m-0 flex h-full max-h-none w-full max-w-none items-center justify-center overflow-visible border-0 bg-[var(--st-ov)] p-4 backdrop:bg-transparent"
    >
      <div
        ref={panelBodyRef}
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-32px)] ${view === "tools" ? "w-[560px]" : "w-[860px]"} max-w-full flex-col gap-5 overflow-hidden rounded-sheet bg-studio-surface p-6 text-studio-text outline-none ${DIALOG_SHADOW}`}
      >
        <div className="flex flex-none items-center gap-2">
          <h2 className="flex-1 font-display text-xl font-semibold leading-7">
            {t("preview.shortcutsAndTools")}
          </h2>
          <OutlinePill
            height={32}
            data-shortcuts-view-switch=""
            onClick={() => setView(view === "tools" ? "shortcuts" : "tools")}
          >
            {view === "tools" ? t("preview.shortcuts") : t("preview.tools")}
          </OutlinePill>
          <PreviewIconButton label={t("preview.close")} onClick={onClose}>
            <PreviewIcon name="close" />
          </PreviewIconButton>
        </div>
        <div className="-mr-2 flex min-h-0 flex-col gap-5 overflow-y-auto pr-2">
          {view === "tools" ? (
            <>
              <JumpToFrameSection
                disabled={transport.disabled}
                duration={transport.duration}
                onSeek={transport.onSeek}
              />
              <WorkAreaSection
                inPoint={transport.inPoint}
                outPoint={transport.outPoint}
                setInPoint={transport.setInPoint}
                setOutPoint={transport.setOutPoint}
              />
            </>
          ) : (
            DESKTOP_SHORTCUT_ROWS.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {row.map((column, columnIndex) => (
                  <div key={columnIndex} className="flex min-w-0 flex-col gap-5">
                    {column.map((section) => (
                      <ShortcutSectionList key={section.id} section={section} />
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * "Comenzi rapide și instrumente": opens on the tools (St-Preview-Tools, 560px: frame jump and
 * work area); the title-row pill switches to the shortcut reference (St-Preview-Shortcuts,
 * -ShortcutsEdit: 860px, two columns, scrolls).
 * Escape, the close button, the trigger or any press outside the dialog (the scrim) closes it.
 */
export const ShortcutsPanel = memo(function ShortcutsPanel(props: ShortcutsPanelProps) {
  useLocale();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsPanelId = useId();
  const closeShortcuts = useCallback(() => setShowShortcuts(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative flex-shrink-0">
      <PreviewIconButton
        ref={triggerRef}
        label={t("preview.shortcutsAndTools")}
        tone={showShortcuts ? "selected" : "plain"}
        onClick={() => setShowShortcuts((v) => !v)}
        aria-expanded={showShortcuts}
        aria-controls={shortcutsPanelId}
      >
        <PreviewIcon name="keyboard" />
      </PreviewIconButton>
      {showShortcuts &&
        createPortal(
          <ShortcutsDialog
            {...props}
            dialogId={shortcutsPanelId}
            triggerRef={triggerRef}
            onClose={closeShortcuts}
          />,
          document.body,
        )}
    </div>
  );
});
