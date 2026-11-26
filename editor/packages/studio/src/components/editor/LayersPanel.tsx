import { memo, useState, useCallback, useEffect, useRef } from "react";
import {
  collectDomEditLayerItems,
  getDomEditLayerKey,
  resolveDomEditSelection,
  type DomEditLayerItem,
} from "./domEditing";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { useDomEditContext } from "../../contexts/DomEditContext";
import { usePlayerStore, liveTime } from "../../player";
import {
  findMatchingTimelineElementId,
  resolveTimelineSelectionSeekTime,
} from "../../utils/studioHelpers";
import { EmptyState } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { useLayerDrag, isLayerDraggable, type LayerReorderEvent } from "./useLayerDrag";
import { getVisibleLayers, sortLayersByZIndex } from "./layersPanelSort";
import { createRafThrottle } from "./layersRafThrottle";
import { deriveTimelineStoreKey } from "../../player/lib/timelineElementHelpers";
import { resolveZOrderReposition } from "./canvasContextMenuZOrder";
import { buildStableSelector } from "./domEditingDom";
import { zReorderCoalesceKey } from "../../hooks/useElementLifecycleOps";
import { useLayerReorderTimelineMirror } from "../nle/useCanvasZOrderTimelineMirror";
import { runZLaneGesture } from "../nle/zLaneGesture";
import { useLayerRevealOverride } from "./useLayerRevealOverride";

// Rows this panel renders before it stops. A display budget, not a document limit.
const LAYERS_PANEL_MAX_ROWS = 80;

const TAG_ICONS: Record<string, string> = {
  video: "Vi",
  audio: "Au",
  img: "Im",
  svg: "Sv",
  canvas: "Cn",
  div: "Di",
  section: "Se",
  span: "Sp",
  p: "P",
  h1: "H1",
  h2: "H2",
  h3: "H3",
  h4: "H4",
  h5: "H5",
  h6: "H6",
  a: "A",
  button: "Bt",
  ul: "Ul",
  ol: "Ol",
  li: "Li",
  style: "St",
  template: "Te",
};

function getTagBadge(tagName: string): string {
  return TAG_ICONS[tagName] ?? tagName.slice(0, 2).toUpperCase();
}

function isCompositionHost(el: HTMLElement): boolean {
  return el.hasAttribute("data-composition-src") || el.hasAttribute("data-composition-file");
}

interface CollapsedState {
  [key: string]: boolean;
}

// fallow-ignore-next-line complexity
export const LayersPanel = memo(function LayersPanel() {
  useLocale();
  const { previewIframeRef, activeCompPath, showToast } = useStudioShellContext();
  const { refreshKey, compositionLoading, timelineElements, isPlaying } =
    useStudioPlaybackContext();
  const currentTime = usePlayerStore((s) => s.currentTime);
  // Flashless z commits (canvas menu, timeline lane-drag z-sync) mutate iframe
  // z-indexes with no reload and no refreshKey bump — while paused, nothing
  // else re-collects, so the panel's z-sorted order would go stale.
  const zEditVersion = usePlayerStore((s) => s.zEditVersion);
  const {
    domEditSelection,
    activeGroupElement,
    applyDomSelection,
    updateDomEditHoverSelection,
    handleDomZIndexReorderCommit,
    setActiveGroupElement,
  } = useDomEditContext();

  const [layers, setLayers] = useState<DomEditLayerItem[]>([]);
  const [collapsed, setCollapsed] = useState<CollapsedState>({});
  const prevDocVersionRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mirrorLayerReorderToTimeline = useLayerReorderTimelineMirror();
  const { scheduleReveal } = useLayerRevealOverride({
    isPlaying,
    selectedElement: domEditSelection?.element ?? null,
  });

  const isMasterView = !activeCompPath || activeCompPath === "index.html";

  const collectLayers = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    let doc: Document | null = null;
    try {
      doc = iframe.contentDocument;
    } catch {
      return;
    }
    if (!doc) return;

    const root =
      doc.querySelector<HTMLElement>("[data-composition-id]") ?? doc.documentElement ?? null;
    if (!root) return;

    // A preview reload detaches the drilled-into wrapper; exit drill-in if so.
    if (activeGroupElement && !activeGroupElement.isConnected) setActiveGroupElement(null);

    const items = collectDomEditLayerItems(
      root,
      { activeCompositionPath: activeCompPath, isMasterView, activeGroupElement },
      // How many rows this panel is willing to render, nothing more. Hit-testing
      // callers deliberately take the whole document instead.
      LAYERS_PANEL_MAX_ROWS,
    );
    setLayers(sortLayersByZIndex(items));
  }, [previewIframeRef, activeCompPath, isMasterView, activeGroupElement, setActiveGroupElement]);

  useEffect(() => {
    collectLayers();
  }, [collectLayers, refreshKey, zEditVersion]);

  useEffect(() => {
    const iframe = previewIframeRef.current;
    if (!iframe) return;
    const handleLoad = () => {
      prevDocVersionRef.current += 1;
      collectLayers();
    };
    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [previewIframeRef, collectLayers]);

  useEffect(() => {
    if (!compositionLoading) {
      const timer = setTimeout(collectLayers, 100);
      return () => clearTimeout(timer);
    }
  }, [compositionLoading, collectLayers]);

  // Subscribe to liveTime so the panel refreshes during scrubbing.
  // liveTime bypasses React state (no re-renders per frame), so a plain
  // usePlayerStore(s => s.currentTime) subscription never fires while the
  // RAF loop is running.  Throttle with a trailing rAF + 100 ms cooldown to
  // avoid a collectLayers call on every animation frame.
  useEffect(() => {
    const throttle = createRafThrottle(collectLayers, 100);
    const unsubscribe = liveTime.subscribe(throttle.invoke);
    return () => {
      unsubscribe();
      throttle.cancel();
    };
  }, [collectLayers]);

  const resolveSelection = useCallback(
    (layer: DomEditLayerItem) => {
      // Re-find the element from the live DOM — layer.element may be stale
      // after soft reload (which replaces scripts without reloading the iframe).
      let el = layer.element;
      if (!el.isConnected) {
        const iframe = previewIframeRef.current;
        const doc = iframe?.contentDocument;
        if (doc) {
          const found =
            (layer.id ? doc.getElementById(layer.id) : null) ??
            (layer.hfId ? doc.querySelector(`[data-hf-id="${CSS.escape(layer.hfId)}"]`) : null) ??
            doc.getElementById(layer.key);
          if (found instanceof HTMLElement) el = found;
        }
      }
      return resolveDomEditSelection(el, {
        activeCompositionPath: activeCompPath,
        isMasterView,
        preferClipAncestor: false,
        activeGroupElement,
      });
    },
    [activeCompPath, isMasterView, previewIframeRef, activeGroupElement],
  );

  const seekToLayer = useCallback(
    async (layer: DomEditLayerItem) => {
      const selection = await resolveSelection(layer);
      if (!selection) return;

      let matchedId = findMatchingTimelineElementId(selection, timelineElements);

      if (!matchedId) {
        const sourceFile = selection.sourceFile ?? "index.html";
        let ancestor = layer.element.parentElement;
        while (ancestor && !matchedId) {
          const elId = ancestor.id;
          if (elId) {
            const found = timelineElements.find(
              (e) => e.domId === elId && (e.sourceFile ?? "index.html") === sourceFile,
            );
            if (found) matchedId = found.key ?? found.id;
          }
          ancestor = ancestor.parentElement;
        }
      }

      if (matchedId) {
        const el = timelineElements.find((e) => (e.key ?? e.id) === matchedId);
        if (el) {
          const nextTime = resolveTimelineSelectionSeekTime(currentTime, el);
          if (nextTime != null) usePlayerStore.getState().requestSeek(nextTime);
        }
      }
    },
    [currentTime, resolveSelection, timelineElements],
  );

  const handleSelectLayer = useCallback(
    async (layer: DomEditLayerItem) => {
      const selection = await resolveSelection(layer);
      if (!selection) return;
      applyDomSelection(selection);
      await seekToLayer(layer);
      // Force-reveal AFTER the seek's runtime visibility sync has had a beat:
      // a clip made active by the seek shows naturally and needs no override,
      // so the reveal only touches nodes that REMAIN hidden (animation-parked
      // opacity, non-clip display/visibility hides, hidden ancestors).
      scheduleReveal(selection.element, 150);
    },
    [resolveSelection, applyDomSelection, seekToLayer, scheduleReveal],
  );

  // Double-click a group row → drill into it; any other row → select it.
  const handleLayerDoubleClick = useCallback(
    async (layer: DomEditLayerItem) => {
      const selection = await resolveSelection(layer);
      if (selection?.element.hasAttribute("data-hf-group")) {
        setActiveGroupElement(selection.element);
      } else {
        await handleSelectLayer(layer);
      }
    },
    [resolveSelection, setActiveGroupElement, handleSelectLayer],
  );

  const handleLayerHover = useCallback(
    async (layer: DomEditLayerItem | null) => {
      if (!layer) {
        updateDomEditHoverSelection(null);
        return;
      }
      const selection = await resolveSelection(layer);
      updateDomEditHoverSelection(selection);
    },
    [resolveSelection, updateDomEditHoverSelection],
  );

  const toggleCollapse = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // fallow-ignore-next-line complexity
  const handleReorder = useCallback(
    (event: LayerReorderEvent) => {
      const { siblingLayers, fromIndex, toIndex } = event;
      const reordered = [...siblingLayers];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      // Panel order is top-first (sortLayersByZIndex: z desc, later-DOM-first),
      // so the desired RENDER order (bottom→top) is the reverse. The minimal
      // resolver (shared with the canvas z-menu) then writes one between-z
      // value when a strict gap exists, band-safe renumber otherwise — instead
      // of the old computeReorderZValues stamp of every sibling.
      const desiredBottomToTop = [...reordered].reverse();
      const patches = resolveZOrderReposition(
        moved.element,
        desiredBottomToTop.map((l) => l.element),
      );
      if (!patches || patches.length === 0) return; // paint order unchanged

      const layerByElement = new Map(siblingLayers.map((l) => [l.element, l]));
      const entries: Array<{
        element: HTMLElement;
        zIndex: number;
        id?: string;
        selector?: string;
        selectorIndex?: number;
        sourceFile: string;
        key?: string;
      }> = [];
      for (const patch of patches) {
        // The renumber fallback can patch a painting sibling the panel didn't
        // list (non-collected family member): derive its identity from the DOM
        // node, exactly like the canvas menu's siblingZIndexEntry. Un-targetable
        // nodes get a live-only style write (reverts on reload).
        const layer = layerByElement.get(patch.element);
        const id = layer?.id ?? (patch.element.id || undefined);
        const selector = layer?.selector ?? buildStableSelector(patch.element);
        if (!id && !selector) {
          patch.element.style.zIndex = String(patch.zIndex);
          continue;
        }
        const sourceFile = layer?.sourceFile ?? moved.sourceFile;
        entries.push({
          element: patch.element,
          zIndex: patch.zIndex,
          id,
          selector,
          selectorIndex: layer?.selectorIndex,
          sourceFile,
          key: deriveTimelineStoreKey({
            domId: id,
            selector,
            selectorIndex: layer?.selectorIndex,
            sourceFile,
          }),
        });
      }
      if (entries.length === 0) return;

      // ONE undo entry for the whole gesture: the z persist and the timeline
      // lane mirror below share this per-gesture-unique key (same contract as
      // the canvas menu's wiring in PreviewOverlays).
      const coalesceKey = zReorderCoalesceKey(entries, "layer-drag");
      const desiredOrderKeys = desiredBottomToTop.map(
        (l) =>
          deriveTimelineStoreKey({
            domId: l.id,
            selector: l.selector,
            selectorIndex: l.selectorIndex,
            sourceFile: l.sourceFile,
          }) ?? null,
      );
      const movedKey = deriveTimelineStoreKey({
        domId: moved.id,
        selector: moved.selector,
        selectorIndex: moved.selectorIndex,
        sourceFile: moved.sourceFile,
      });
      // One serialized z→lane transaction (shared queue with the canvas
      // z-order menu): the mirror runs only after a DURABLE z persist, and
      // rapid successive gestures cannot interleave phases — see
      // runZLaneGesture.
      runZLaneGesture({
        commitZ: () => handleDomZIndexReorderCommit(entries, coalesceKey, "layer-drag"),
        mirror: () =>
          mirrorLayerReorderToTimeline({ selectionKey: movedKey, desiredOrderKeys, coalesceKey }),
      }).catch(() => undefined);
    },
    [handleDomZIndexReorderCommit, mirrorLayerReorderToTimeline],
  );

  const selectedKey = domEditSelection ? getDomEditLayerKey(domEditSelection) : null;
  const visibleLayers = getVisibleLayers(layers, collapsed);

  const handleSingleSibling = useCallback(() => {
    showToast("Only one layer at this level", "info");
  }, [showToast]);

  const {
    dragKey,
    insertionLineY,
    handleRowPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
  } = useLayerDrag({
    visibleLayers,
    scrollContainerRef,
    onReorder: handleReorder,
    onSingleSibling: handleSingleSibling,
  });

  if (layers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center pb-10">
        <EmptyState illustration="studio-empty-project" title={t("layers.empty")} />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-studio-surface"
      onPointerLeave={() => handleLayerHover(null)}
    >
      <div
        ref={scrollContainerRef}
        aria-label={t("layers.count", { n: layers.length })}
        className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pt-0.5 pb-4"
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
      >
        {activeGroupElement && (
          <button
            type="button"
            onClick={() => setActiveGroupElement(null)}
            className="flex min-h-11 w-full flex-none items-center gap-2 rounded-md bg-studio-surface px-3 text-left text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-bd)] hover:bg-[var(--st-sub)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span className="truncate">
              {activeGroupElement.getAttribute("data-hf-group") || t("layers.group")}
            </span>
          </button>
        )}
        {visibleLayers.map((layer, index) => {
          const selected = layer.key === selectedKey;
          const isDragged = layer.key === dragKey;
          const draggable = isLayerDraggable(layer);
          const isCollapsed = collapsed[layer.key] ?? false;
          const hasChildren = layer.childCount > 0;
          const isCompHost = isCompositionHost(layer.element);

          return (
            <div
              key={layer.key}
              data-layer-index={index}
              role="button"
              tabIndex={0}
              onClick={() => !dragKey && handleSelectLayer(layer)}
              onDoubleClick={() => !dragKey && handleLayerDoubleClick(layer)}
              onPointerDown={(e) => handleRowPointerDown(index, e)}
              onPointerEnter={() => !dragKey && handleLayerHover(layer)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectLayer(layer);
                }
              }}
              className={`group flex min-h-11 w-full flex-none items-center gap-2 rounded-md pr-3 text-left transition-colors outline-none focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
                isDragged
                  ? "opacity-40"
                  : selected
                    ? "bg-studio-selected text-studio-on-selected"
                    : "bg-studio-surface text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-bd)] hover:bg-[var(--st-sub)]"
              } ${dragKey ? "cursor-grabbing" : "cursor-pointer"}`}
              style={{ paddingLeft: 12 + layer.depth * 16 }}
              title={
                draggable
                  ? layer.element.hasAttribute("data-hf-group")
                    ? t("layers.enterGroup")
                    : undefined
                  : t("layers.locked")
              }
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => toggleCollapse(layer.key, e)}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? t("layers.expand") : t("layers.collapse")}
                  className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-current before:absolute before:-inset-1.5 before:content-['']"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              ) : (
                <span className="w-5 flex-shrink-0" />
              )}
              <span
                className={`flex h-6 min-w-7 flex-shrink-0 items-center justify-center rounded-sm px-1.5 text-[11px] font-medium ${
                  selected
                    ? "bg-studio-surface text-studio-text"
                    : isCompHost
                      ? "text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
                      : "text-studio-muted shadow-[inset_0_0_0_1px_var(--st-bd)]"
                }`}
              >
                {getTagBadge(layer.tagName)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {layer.label}
              </span>
              {hasChildren && (
                <span className="text-xs tabular-nums opacity-70">{layer.childCount}</span>
              )}
            </div>
          );
        })}
        {insertionLineY != null && (
          <div
            className="pointer-events-none absolute right-4 left-4 h-0.5 rounded-full bg-studio-accent"
            style={{ top: insertionLineY }}
          />
        )}
      </div>
    </div>
  );
});

// The sort helper lives in layersPanelSort.ts (600-line studio cap);
// re-exported so existing imports from "./LayersPanel" still resolve.
export { sortLayersByZIndex } from "./layersPanelSort";
// The throttle lives in layersRafThrottle.ts; re-exported for the test that exercises it.
export { createRafThrottle } from "./layersRafThrottle";
