import React from "react";
import { type DomEditSelection } from "./domEditing";
import { t } from "../../i18n/translate";
import { PreviewIcon } from "../nle/preview/previewChrome";
import { offCanvasSide } from "./offCanvasSide";

export interface OffCanvasRect {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
}

interface OffCanvasIndicatorsProps {
  rects: OffCanvasRect[];
  elements: React.MutableRefObject<Map<string, HTMLElement>>;
  compRect: { left: number; top: number; width: number; height: number };
  selection: DomEditSelection | null;
  groupSelections: DomEditSelection[];
  activeCompositionPathRef: React.MutableRefObject<string | null>;
  onSelectionChangeRef: React.MutableRefObject<
    (selection: DomEditSelection, options?: { revealPanel?: boolean; additive?: boolean }) => void
  >;
}

function clipOutsideCanvas(
  rect: OffCanvasRect,
  compRect: { left: number; top: number; width: number; height: number },
): string | undefined {
  const angle = rect.angle ?? 0;
  if (!angle) {
    const left = Math.max(0, compRect.left - rect.left);
    const top = Math.max(0, compRect.top - rect.top);
    const right = Math.min(rect.width, compRect.left + compRect.width - rect.left);
    const bottom = Math.min(rect.height, compRect.top + compRect.height - rect.top);
    if (left >= right || top >= bottom) return undefined;
    return `polygon(evenodd, 0 0, ${rect.width}px 0, ${rect.width}px ${rect.height}px, 0 ${rect.height}px, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;
  }

  const radians = (-angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const toLocal = (x: number, y: number) => {
    const dx = x - centerX;
    const dy = y - centerY;
    return `${rect.width / 2 + dx * cos - dy * sin}px ${rect.height / 2 + dx * sin + dy * cos}px`;
  };
  const left = compRect.left;
  const top = compRect.top;
  const right = left + compRect.width;
  const bottom = top + compRect.height;
  const canvas = [
    toLocal(left, top),
    toLocal(right, top),
    toLocal(right, bottom),
    toLocal(left, bottom),
    toLocal(left, top),
  ].join(", ");
  return `polygon(evenodd, 0 0, ${rect.width}px 0, ${rect.width}px ${rect.height}px, 0 ${rect.height}px, 0 0, ${canvas})`;
}

// Re-exported so existing imports from this module keep resolving.
export { offCanvasSide } from "./offCanvasSide";

type Box = { left: number; top: number; width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Chip on the frame edge pointing at an element that is entirely outside it (St-Preview-OffCanvas). */
function OffCanvasChip({
  rect,
  comp,
  label,
  onSelect,
}: {
  rect: Box;
  comp: Box;
  label: string;
  onSelect: () => void;
}) {
  const side = offCanvasSide(rect, comp);
  if (!side) return null;
  const centerX = clamp(rect.left + rect.width / 2, comp.left + 40, comp.left + comp.width - 40);
  const centerY = clamp(rect.top + rect.height / 2, comp.top + 24, comp.top + comp.height - 24);
  const position: React.CSSProperties =
    side === "top"
      ? { left: centerX, top: comp.top + 12, transform: "translateX(-50%)" }
      : side === "bottom"
        ? { left: centerX, top: comp.top + comp.height - 42, transform: "translateX(-50%)" }
        : side === "left"
          ? { left: comp.left + 12, top: centerY, transform: "translateY(-50%)" }
          : {
              left: comp.left + comp.width - 12,
              top: centerY,
              transform: "translate(-100%, -50%)",
            };
  const icon =
    side === "top"
      ? "chevronUp"
      : side === "bottom"
        ? "chevronDown"
        : side === "left"
          ? "back"
          : "chevronRight";
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={t("preview.offCanvas", { name: label })}
      title={t("preview.offCanvas", { name: label })}
      className="pointer-events-auto absolute z-[2] inline-flex h-[30px] max-w-[160px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-studio-surface px-2.5 text-xs font-semibold text-studio-text shadow-studio hover:bg-[var(--st-sub)]"
      style={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }
      }}
    >
      <PreviewIcon name={icon} size={14} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function offCanvasLabel(element: HTMLElement | undefined, key: string): string {
  const fromData = element?.getAttribute("data-label") || element?.id;
  if (fromData) return fromData;
  const parts = key.split(":");
  return parts[1] || key;
}

/**
 * Dashed teal indicators for elements whose bounds extend past the composition
 * (the "gray zone"). The in-canvas portion is clipped away so only the
 * protruding sliver is dashed — the on-canvas part gets no outline, since a
 * solid selection-style border on an unselected element reads as "selected".
 * Extracted from DomEditOverlay to keep that file under the 600-LOC cap.
 */
export function OffCanvasIndicators({
  rects,
  elements,
  compRect,
  selection,
  groupSelections,
  activeCompositionPathRef,
  onSelectionChangeRef,
}: OffCanvasIndicatorsProps): React.ReactElement {
  return (
    <>
      {rects
        .filter((r) => {
          // Suppress the indicator for any currently-selected element (primary
          // OR a marquee group member) — those already render a selection box.
          const el = elements.current.get(r.key);
          if (!el) return true;
          if (selection?.element === el) return false;
          return !groupSelections.some((g) => g.element === el);
        })
        .map((r) => {
          const pos = {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            transform: r.angle ? `rotate(${r.angle}deg)` : undefined,
            transformOrigin: "center",
          };
          const clipOutside = clipOutsideCanvas(r, compRect);
          const selectOffCanvas = async () => {
            const el = elements.current.get(r.key);
            if (!el) return;
            const { resolveDomEditSelection } = await import("./domEditingLayers");
            const acp = activeCompositionPathRef.current ?? "index.html";
            const sel = await resolveDomEditSelection(el, {
              activeCompositionPath: acp,
              isMasterView: !acp || acp === "index.html",
              skipSourceProbe: true,
            });
            if (sel) onSelectionChangeRef.current(sel, { revealPanel: true });
          };
          const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            void selectOffCanvas();
          };
          return (
            <React.Fragment key={`offcanvas-${r.key}`}>
              <OffCanvasChip
                rect={r}
                comp={compRect}
                label={offCanvasLabel(elements.current.get(r.key), r.key)}
                onSelect={() => void selectOffCanvas()}
              />
              <div className="pointer-events-none absolute" style={pos}>
                {/* Dashed layer — clipped to exclude canvas area.
                  Note: clip-path is visual only — hit-testing still covers the
                  full bounding rect, so clicking the in-canvas portion selects
                  via this handler. That's acceptable: it resolves the same
                  element the normal canvas path would, just with
                  skipSourceProbe (the element is already known here). */}
                <button
                  type="button"
                  aria-label={t("preview.offCanvasSelect", { name: r.key })}
                  className="pointer-events-auto absolute inset-0 cursor-pointer rounded-sm border-2 border-dashed border-studio-muted transition-colors hover:border-studio-text"
                  style={clipOutside ? { clipPath: clipOutside } : undefined}
                  title={t("preview.offCanvas", {
                    name: offCanvasLabel(elements.current.get(r.key), r.key),
                  })}
                  onClick={handleClick}
                />
              </div>
            </React.Fragment>
          );
        })}
    </>
  );
}

/**
 * The dashed outlines around a selected element's children.
 *
 * Extracted from the canvas overlay, which is at its 600-line limit, and it
 * sits here rather than in its own file because it is the same kind of thing:
 * a passive, non-interactive mark the overlay draws over the composition.
 */
export function ChildRectOutlines({
  rects,
}: {
  rects: ReadonlyArray<{
    left: number;
    top: number;
    width: number;
    height: number;
    angle?: number;
  }>;
}) {
  return (
    <>
      {rects.map((rect, index) => (
        <div
          key={index}
          className="pointer-events-none absolute border border-dashed border-white/20 rounded-sm"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            // A child outline is drawn ON the child, so it rotates with it.
            transform: rect.angle ? `rotate(${rect.angle}deg)` : undefined,
          }}
        />
      ))}
    </>
  );
}
