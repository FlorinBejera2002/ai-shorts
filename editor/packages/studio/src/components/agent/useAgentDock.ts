// Where the docked Ana și Radu panel sits on desktop: the inspector column (St-Agent), the
// same card position as the inspector (top of the cards row, 12px from the window edge, as tall
// as the preview card). Measured from the shell so it follows panel resizes and the timeline.
import { useCallback, useRef, useState, type CSSProperties } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { useLatestRef } from "./useLatestRef";

const PANEL_WIDTH = 340;
const EDGE = 12;
// The cards row has 12px top padding and 9px bottom padding (plus the timeline's 3px handle).
const ROW_TOP_PADDING = 12;
const ROW_BOTTOM_PADDING = 9;
// The inspector slot adds 9px of left padding and the panel's own 3px seam.
const INSPECTOR_GAP = 12;

export interface AgentDockGeometry {
  panel: CSSProperties;
  /** Bottom offset that puts a toast 4px above the bottom of the preview card. */
  toastBottom: number;
}

function cardsRow(): HTMLElement | null {
  const body = document.querySelector<HTMLElement>("[data-studio-shell-body='desktop']");
  const row = body?.firstElementChild;
  return row instanceof HTMLElement ? row : null;
}

export function measureDock(): AgentDockGeometry | null {
  const row = cardsRow();
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  const top = rect.top + ROW_TOP_PADDING;
  const bottom = rect.bottom - ROW_BOTTOM_PADDING;
  const right = window.innerWidth - EDGE;
  // A visible inspector sets the column width; otherwise the board's 340px column.
  const last = row.lastElementChild;
  const inspector =
    last instanceof HTMLElement && last.querySelector("[data-preview-pan-surface]") === null
      ? last.getBoundingClientRect()
      : null;
  const left =
    inspector && inspector.width - INSPECTOR_GAP >= 240
      ? inspector.left + INSPECTOR_GAP
      : Math.max(EDGE, right - PANEL_WIDTH);
  return {
    panel: { top, left, width: right - left, height: Math.max(240, bottom - top) },
    toastBottom: Math.max(16, window.innerHeight - bottom + 4),
  };
}

/** Live dock geometry; null until the desktop shell is on screen. */
export function useAgentDock(active: boolean): AgentDockGeometry | null {
  const [geometry, setGeometry] = useState<AgentDockGeometry | null>(null);
  const frame = useRef<number | null>(null);
  const activeRef = useLatestRef(active);

  const update = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const next = measureDock();
      setGeometry((previous) =>
        previous && next && JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    });
  }, []);

  useMountEffect(() => {
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    let observed: Element[] = [];
    // The shell mounts after the project loads and its columns come and go (inspector hidden,
    // rail): re-attach to the current row and column when they change.
    const attach = () => {
      const row = cardsRow();
      const targets = row ? [row, row.lastElementChild].filter((node) => node !== null) : [];
      if (targets.length === observed.length && targets.every((node, i) => node === observed[i]))
        return;
      observed = targets;
      observer?.disconnect();
      for (const node of targets) observer?.observe(node);
      update();
    };
    attach();
    const timer = window.setInterval(() => {
      if (activeRef.current) attach();
    }, 500);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", update);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  });

  return geometry;
}
