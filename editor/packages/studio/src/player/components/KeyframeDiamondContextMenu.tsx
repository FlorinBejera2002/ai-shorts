import { useState } from "react";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { useMenuKeyboardNav } from "./menuKeyboardNav";
import type { TimelineElement } from "../store/playerStore";
import type { TimelineKeyframeTarget } from "./timelineKeyframeIdentity";
import { t, useLocale } from "../../i18n/translate";
import { TimelineMenuItem, TimelineMenuSurface } from "./TimelineMenu";

export interface KeyframeDiamondContextMenuState {
  x: number;
  y: number;
  /** Timeline project session that created this portaled target. */
  sessionEpoch?: number;
  element: TimelineElement;
  elementId: string;
  percentage: number;
  tweenPercentage?: number;
  propertyGroup?: string;
  animationId?: string;
  currentEase?: string;
}

interface KeyframeDiamondContextMenuProps {
  state: KeyframeDiamondContextMenuState;
  onClose: () => void;
  /** Omitted where this node cannot be deleted on its own (see the arc-waypoint
   *  floor in removeMotionPathPointInScript): an entry that silently no-ops is
   *  worse than no entry. */
  onDelete?: (elementId: string, keyframe: TimelineKeyframeTarget) => void;
  onDeleteAll: (element: TimelineElement, animationId?: string) => void;
  /** Focus this keyframe's ease segment in the inspector. Omitted when the
   *  keyframe carries no tween identity to focus. */
  onEditEase?: (elementId: string, keyframe: TimelineKeyframeTarget) => void;
  /** Copy the keyframe's properties to the clipboard; resolves false on failure. */
  onCopyProperties?: (
    elementId: string,
    keyframe: TimelineKeyframeTarget,
  ) => Promise<boolean> | boolean | void;
  /** Retime the keyframe to the current playhead, preserving its value + ease. */
  onMoveToPlayhead?: (element: TimelineElement, keyframe: TimelineKeyframeTarget) => void;
}

export function KeyframeDiamondContextMenu({
  state,
  onClose,
  onDelete,
  onDeleteAll,
  onEditEase,
  onCopyProperties,
  onMoveToPlayhead,
}: KeyframeDiamondContextMenuProps) {
  useLocale();
  const menuRef = useContextMenuDismiss(onClose);
  // The clicked diamond's identity, built once: the menu's mutating entries
  // all act on it, and they must not disagree about which keyframe was clicked.
  const keyframe: TimelineKeyframeTarget = {
    percentage: state.percentage,
    tweenPercentage: state.tweenPercentage,
    propertyGroup: state.propertyGroup,
    animationId: state.animationId,
  };
  useMenuKeyboardNav(menuRef);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopyProperties = async () => {
    if (!onCopyProperties) return;
    const result = await onCopyProperties(state.elementId, keyframe);
    if (result === false) {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 1500);
      return;
    }
    setCopyStatus("copied");
    setTimeout(onClose, 700);
  };

  // Measured off the rendered rows, so the flip-up test stays right as optional entries
  // drop out.
  const rows =
    1 +
    (onMoveToPlayhead ? 1 : 0) +
    (onEditEase ? 1 : 0) +
    (onCopyProperties ? 1 : 0) +
    (onDelete ? 1 : 0);
  const copyLabel =
    copyStatus === "copied"
      ? t("timeline.kfCopied")
      : copyStatus === "failed"
        ? t("timeline.kfCopyFailed")
        : t("timeline.kfCopy");

  return (
    <TimelineMenuSurface
      ref={menuRef}
      label={t("timeline.kfActions")}
      title={t("timeline.kfTitle")}
      x={state.x}
      y={state.y}
      width={250}
      estimatedHeight={12 + rows * 38}
      onDismiss={onClose}
    >
      {onMoveToPlayhead && (
        <TimelineMenuItem
          icon="clock"
          onClick={() => {
            // Pass clip-% — resolveKeyframeTarget keys the cache lookup on clip-% and
            // returns the tween-% for the mutation. Passing tween-% here would miss the
            // lookup on any tween whose window is shorter than the clip.
            onMoveToPlayhead(state.element, keyframe);
            onClose();
          }}
        >
          {t("timeline.kfMoveToPlayhead")}
        </TimelineMenuItem>
      )}
      {onEditEase && (
        <TimelineMenuItem
          icon="pen"
          hint={state.currentEase ?? t("timeline.kfEaseDefault")}
          onClick={() => {
            onEditEase(state.elementId, keyframe);
            onClose();
          }}
        >
          {t("timeline.kfEditEase")}
        </TimelineMenuItem>
      )}
      {onCopyProperties && (
        <TimelineMenuItem
          icon={copyStatus === "copied" ? "check" : "copy"}
          active={copyStatus === "copied"}
          danger={copyStatus === "failed"}
          onClick={() => {
            void handleCopyProperties();
          }}
        >
          {copyLabel}
        </TimelineMenuItem>
      )}
      {onDelete && (
        <TimelineMenuItem
          icon="trash"
          danger
          onClick={() => {
            onDelete(state.elementId, keyframe);
            onClose();
          }}
        >
          {t("timeline.kfDelete")}
        </TimelineMenuItem>
      )}
      <TimelineMenuItem
        icon="trash"
        danger
        onClick={() => {
          onDeleteAll(state.element, state.animationId);
          onClose();
        }}
      >
        {t("timeline.kfDeleteAll")}
      </TimelineMenuItem>
    </TimelineMenuSurface>
  );
}
