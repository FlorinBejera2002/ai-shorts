import { memo, type CSSProperties, type ReactNode } from "react";
import { t } from "../../i18n/translate";
import type { TimelineElement } from "../store/playerStore";
import { defaultTimelineTheme, getClipHandleOpacity, type TimelineTheme } from "./timelineTheme";
import type { TimelineEditCapabilities } from "./timelineEditing";
import { isAudioTimelineElement } from "../../utils/timelineInspector";
import { timelineClipFocusId } from "./timelineNavigationIdentity";
import { formatDecimalSeconds, formatShortTime } from "./timelineDisplayTime";
import "./TimelineClip.css";

interface TimelineClipProps {
  el: TimelineElement;
  pps: number;
  clipY: number;
  clipHeight?: number;
  isSelected: boolean;
  isHovered: boolean;
  isDragging?: boolean;
  isGestureActor?: boolean;
  isActive?: boolean;
  hasCustomContent: boolean;
  capabilities: TimelineEditCapabilities;
  theme?: TimelineTheme;
  isComposition: boolean;
  tabIndex?: 0 | -1;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onResizeStart?: (edge: "start" | "end", e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children?: ReactNode;
}

// fallow-ignore-next-line complexity
export const TimelineClip = memo(function TimelineClip({
  el,
  pps,
  clipY,
  clipHeight,
  isSelected,
  isHovered,
  isDragging = false,
  isGestureActor = false,
  isActive = false,
  hasCustomContent,
  capabilities,
  theme = defaultTimelineTheme,
  isComposition,
  tabIndex = -1,
  onHoverStart,
  onHoverEnd,
  onPointerDown,
  onResizeStart,
  onClick,
  onDoubleClick,
  onContextMenu,
  children,
}: TimelineClipProps) {
  const leftPx = el.start * pps;
  const widthPx = Math.max(el.duration * pps, 4);
  const handleOpacity = getClipHandleOpacity({ isHovered, isSelected, isDragging });
  const displayLabel = el.label || el.id || el.tag;
  const showHandles = handleOpacity > 0.01 && (widthPx >= 32 || isSelected);
  const showLabel = widthPx >= 40 || isSelected;
  const showDefaultText = !hasCustomContent && (widthPx >= 40 || isSelected);
  // The board marks each media cut with its length; audio bars and tiny clips skip it.
  const showDurationChip = hasCustomContent && !isAudioTimelineElement(el) && widthPx >= 44;
  const startLabel = formatDecimalSeconds(el.start);
  const endLabel = formatDecimalSeconds(el.start + el.duration);
  const clipClassName = [
    "timeline-clip",
    "absolute",
    hasCustomContent ? "overflow-visible" : "overflow-hidden",
    isSelected ? "is-selected" : "",
    isHovered ? "is-hovered" : "",
    isDragging ? "is-dragging" : "",
    showDefaultText ? "" : "is-micro",
    isAudioTimelineElement(el) ? "is-audio" : "",
    hasCustomContent ? "has-media" : "",
  ]
    .filter((className) => className.length > 0)
    .join(" ");
  const style: CSSProperties = {
    left: leftPx,
    width: widthPx,
    top: clipY,
    ...(clipHeight === undefined ? { bottom: clipY } : { height: clipHeight }),
    borderRadius: theme.clipRadius,
    zIndex: isDragging ? 20 : isSelected ? 10 : isHovered ? 5 : 1,
    // Regular cursor over clips (CapCut-style, user preference) — no grab hand.
    cursor: "default",
    appearance: "none",
    color: "inherit",
    font: "inherit",
    padding: 0,
    textAlign: "left",
    touchAction: "none",
    transform: isDragging ? "translateY(-1px)" : undefined,
  };

  return (
    <button
      type="button"
      data-st-clip=""
      data-clip={isGestureActor ? undefined : "true"}
      data-el-id={isGestureActor ? undefined : (el.key ?? el.id)}
      data-timeline-focus-id={isGestureActor ? undefined : timelineClipFocusId(el.key ?? el.id)}
      data-clip-start={el.start}
      data-clip-end={el.start + el.duration}
      data-clip-hidden={el.hidden ? "true" : undefined}
      data-active={isActive ? "" : undefined}
      aria-hidden={isGestureActor ? "true" : undefined}
      tabIndex={isGestureActor ? undefined : tabIndex}
      aria-label={t("timeline.clipAria", { label: displayLabel, start: startLabel, end: endLabel })}
      aria-pressed={isGestureActor ? undefined : isSelected}
      className={clipClassName}
      style={style}
      title={
        isComposition
          ? t("timeline.clipOpenTitle", { src: el.compositionSrc ?? "" })
          : t("timeline.clipTitle", {
              label: displayLabel,
              start: formatDecimalSeconds(el.start),
              end: formatDecimalSeconds(el.start + el.duration),
            })
      }
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* Left trim handle */}
      {showHandles && capabilities.canTrimStart && (
        <div
          aria-hidden="true"
          onPointerDown={(e) => onResizeStart?.("start", e)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: Math.min(22, widthPx / 3),
            touchAction: "none",
            cursor: "col-resize",
            zIndex: 4,
          }}
        >
          <div
            className="timeline-clip__handle-bar"
            style={{
              position: "absolute",
              left: 4,
              top: 6,
              bottom: 6,
              width: 2,
              borderRadius: 1,
              background: "var(--st-sf)",
              opacity: handleOpacity * 0.6,
            }}
          />
        </div>
      )}
      {/* Right trim handle */}
      {showHandles && capabilities.canTrimEnd && (
        <div
          aria-hidden="true"
          onPointerDown={(e) => onResizeStart?.("end", e)}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: Math.min(22, widthPx / 3),
            touchAction: "none",
            cursor: "col-resize",
            zIndex: 4,
          }}
        >
          <div
            className="timeline-clip__handle-bar"
            style={{
              position: "absolute",
              right: 4,
              top: 6,
              bottom: 6,
              width: 2,
              borderRadius: 1,
              background: "var(--st-sf)",
              opacity: handleOpacity * 0.6,
            }}
          />
        </div>
      )}
      {showLabel && <span className="timeline-clip__label">{displayLabel}</span>}
      {showDurationChip && (
        <span className="timeline-clip__duration">{formatShortTime(el.duration)}</span>
      )}
      {children}
    </button>
  );
});
