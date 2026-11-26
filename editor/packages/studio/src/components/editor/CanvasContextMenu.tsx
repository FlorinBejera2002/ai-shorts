/**
 * Right-click context menu for a selected canvas element.
 *
 * Mirrors the look, positioning, and dismiss behavior of
 * player/components/ClipContextMenu.tsx — portaled to document.body,
 * overflow-adjusted, dismissed on outside-click or Escape via
 * useContextMenuDismiss.
 *
 * ── Wiring (z-order persistence) ─────────────────────────────────────────────
 * Z-index changes are resolved against the live iframe DOM via
 * `resolveZOrderChange`, which returns a MULTI-element patch list (tie-aware:
 * moving a target past an equal-z sibling can require renumbering the affected
 * set). The patches are surfaced through the `onApplyZIndex` prop; the menu
 * itself never mutates element styles — handleDomZIndexReorderCommit applies
 * the live z-index (and injects position when needed) in the same synchronous
 * flow, and captures the TRUE prior styles for its failure rollback.
 *
 * The prop MUST be wired at the call site to route through the full persist
 * path. PreviewOverlays.tsx builds the per-patch PatchTargets (the selected
 * element carries its full selection identity; sibling elements are iframe DOM
 * nodes, so their id / selector are derived from the node and they share the
 * selection's sourceFile) and forwards them to handleDomZIndexReorderCommit.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { memo } from "react";
import { createPortal } from "react-dom";
import type { DomEditSelection } from "./domEditing";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { useIsPhone } from "../shell/useIsPhone";
import { PhoneSheet } from "../shell/PhoneSheet";
import {
  MENU_ROW,
  POPOVER_MENU,
  PreviewIcon,
  type PreviewIconName,
} from "../nle/preview/previewChrome";
import {
  isZOrderActionEnabled,
  resolveCrossedNeighbor,
  resolveZOrderChange,
  type ZOrderAction,
  type ZOrderPatch,
} from "./canvasContextMenuZOrder";

interface CanvasContextMenuProps {
  /** Viewport x of the right-click event. */
  x: number;
  /** Viewport y of the right-click event. */
  y: number;
  selection: DomEditSelection;
  onClose: () => void;
  /**
   * Called with the resolved z-order patch list and the menu action that
   * produced it (the action feeds the undo coalesce key, so two DIFFERENT
   * actions never merge into one undo step). Each patch is an
   * { element, zIndex } pair (the target and, when a renumber is needed,
   * affected siblings). The menu does NOT touch the live DOM — wire to
   * handleDomZIndexReorderCommit, which applies the live styles itself
   * (see module-level wiring comment).
   *
   * `crossed` is the sibling a forward/backward step moved past, resolved from
   * the SAME pre-mutation render order as the patches (null for front/back or
   * when there is no neighbor). The host uses it to mirror the z action into a
   * timeline lane move (resolveZMirrorLaneMove's crossedKey).
   */
  onApplyZIndex?: (
    patches: ZOrderPatch[],
    action: ZOrderAction,
    crossed: HTMLElement | null,
  ) => void;
  /**
   * Called after a successful bring-forward / send-backward with the sibling
   * the target stepped over (resolved from the SAME pre-mutation state as the
   * patches), so the host can flash a highlight on it in the studio overlay.
   * Never called for front/back or no-op actions.
   */
  onZOrderCrossed?: (crossed: HTMLElement, action: ZOrderAction) => void;
  /**
   * Delete the selected element. Wire to handleDomEditElementDelete from
   * useDomEditActionsContext — same path as the Delete/Backspace hotkey.
   * Absent when the caller wires no delete persist path (e.g. a legacy mount):
   * the Delete item is then hidden rather than shown as a silent no-op.
   */
  onDelete?: (selection: DomEditSelection) => void;
}

type ZAction = "bring-forward" | "send-backward" | "bring-to-front" | "send-to-back";

// Stacked-layer + arrow glyphs, one per z action (16px, stroke, currentColor —
// matches the studio's inline-SVG conventions: fill="none", 1.2 stroke, round
// caps/joins). Single actions show ONE layer diamond with the arrow stepping
// one way; front/back show a TWO-diamond stack with the arrow piercing through
// and beyond it. `paths` are the d attributes, drawn in order.
const Z_ACTION_ICONS: Record<ZAction, PreviewIconName> = {
  "bring-to-front": "toFront",
  "bring-forward": "forward",
  "send-backward": "backward",
  "send-to-back": "toBack",
};

const Z_ACTIONS: Array<{ action: ZAction; label: MessageKey }> = [
  { action: "bring-to-front", label: "preview.bringToFront" },
  { action: "bring-forward", label: "preview.bringForward" },
  { action: "send-backward", label: "preview.sendBackward" },
  { action: "send-to-back", label: "preview.sendToBack" },
];

export const CanvasContextMenu = memo(function CanvasContextMenu({
  x,
  y,
  selection,
  onClose,
  onApplyZIndex,
  onZOrderCrossed,
  onDelete,
}: CanvasContextMenuProps) {
  useLocale();
  const isPhone = useIsPhone();
  const menuRef = useContextMenuDismiss(onClose);

  // Gate each item group on the presence of its persist handler. Without the
  // handler the action can't be persisted, so showing it would be a dead-end:
  // a z-write reverts on reload and Delete silently no-ops. Hide the group
  // instead. If nothing is actionable (a legacy mount with no handlers at all),
  // don't render the menu — an empty menu is itself a dead-end.
  const hasZActions = Boolean(onApplyZIndex);
  const hasDelete = Boolean(onDelete);

  // Overflow correction — match ClipContextMenu approach. Only the rendered
  // groups contribute height (keeps positioning correct when a group is hidden).
  const menuWidth = 230;
  const menuHeight = 12 + (hasZActions ? Z_ACTIONS.length * 38 : 0) + (hasDelete ? 38 : 0);
  const overflowY = y + menuHeight - window.innerHeight;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = overflowY > 0 ? y - overflowY - 8 : y;

  const el = selection.element;

  function handleZAction(action: ZAction) {
    if (!onApplyZIndex) return;
    const patches = resolveZOrderChange(el, action);
    if (patches === null) return;
    // Resolve the crossed neighbor BEFORE the commit path mutates live styles —
    // both resolvers must read the same pre-change render order. Always resolved
    // (not only for the flash): onApplyZIndex forwards it so the host can mirror
    // the z step into a timeline lane move.
    const crossed = resolveCrossedNeighbor(el, action);
    // Do NOT pre-apply styles here: handleDomZIndexReorderCommit writes the
    // live z-index (and injects position:relative for static elements) in the
    // same synchronous flow, so feedback is still instant — and it must read
    // the PRE-change styles itself, both to capture true rollback values and
    // to detect a static position that needs persisting.
    onApplyZIndex(patches, action, crossed);
    if (crossed && onZOrderCrossed) onZOrderCrossed(crossed, action);
    onClose();
  }

  function handleDelete() {
    if (!onDelete) return;
    onDelete(selection);
    onClose();
  }

  if (!hasZActions && !hasDelete) return null;

  // The menu is portaled to document.body, but in the React tree it is still a
  // child of the DomEditOverlay <div>. React synthetic events bubble through the
  // REACT tree (not the DOM tree), so a click on any menu control would otherwise
  // bubble into the overlay's onPointerDown / onMouseDown handlers — which
  // preventDefault() to start a marquee and re-resolve the selection. That
  // preventDefault cancels the button's own click and the item action never runs.
  //
  // Stop pointer/mouse propagation at the menu root so overlay gesture handlers
  // never see these events, and drive the item actions on pointerDown (which
  // fires before any outside-click / dismiss logic can unmount the menu).
  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const items = (
    <>
      {hasZActions &&
        Z_ACTIONS.map(({ action, label }) => {
          const enabled = isZOrderActionEnabled(el, action);
          return (
            <button
              key={action}
              type="button"
              role="menuitem"
              className={MENU_ROW}
              disabled={!enabled}
              // Act on pointerDown, not click: a pointerDown that reaches the
              // overlay/document would otherwise re-select or dismiss the menu
              // before the trailing click fires. Running here guarantees the
              // action lands. Guard `button === 0` so a right-press is ignored.
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                if (enabled) handleZAction(action);
              }}
            >
              <PreviewIcon name={Z_ACTION_ICONS[action]} size={16} />
              <span className="flex-1">{t(label)}</span>
            </button>
          );
        })}
      {hasDelete && (
        <button
          type="button"
          role="menuitem"
          className={`${MENU_ROW} !text-studio-danger`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            handleDelete();
          }}
        >
          <PreviewIcon name="trash" size={16} />
          <span className="flex-1">{t("preview.delete")}</span>
          <span className="text-xs text-studio-muted">⌫</span>
        </button>
      )}
    </>
  );

  if (isPhone) {
    return (
      <PhoneSheet open onClose={onClose} title={t("preview.orderAndDelete")}>
        <div ref={menuRef} role="menu" className="flex flex-col gap-0.5 px-2 pb-2">
          {items}
        </div>
      </PhoneSheet>
    );
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={t("preview.orderAndDelete")}
      className={`fixed z-[200] w-[230px] ${POPOVER_MENU}`}
      style={{ left: adjustedX, top: adjustedY }}
      onPointerDown={stopBubble}
      onMouseDown={stopBubble}
      onClick={stopBubble}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items}
    </div>,
    document.body,
  );
});
