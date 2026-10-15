/**
 * Side effects for syncing the DOM edit selection with the preview iframe on
 * load/refresh, and for auto-revealing source in the Code tab.
 * Extracted from useDomEditSession to keep file sizes under the 600-line limit.
 */
import { useEffect, useRef } from "react";
import { findElementForSelection, type DomEditSelection } from "../components/editor/domEditing";
import { reapplyPositionEditsAfterSeek } from "../components/editor/manualEdits";
import type { SidebarTab } from "../components/sidebar/LeftSidebar";
import type { PatchTarget } from "../utils/sourcePatcher";
import { logSelect } from "../utils/selectDebug";
import { isPreviewReadinessMessage } from "../player/hooks/timelineSyncHydration";

interface UseDomEditPreviewSyncParams {
  previewIframe: HTMLIFrameElement | null;
  activeCompPath: string | null;
  captionEditMode: boolean;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  domEditGroupSelectionsRef: React.MutableRefObject<DomEditSelection[]>;
  domEditSelection: DomEditSelection | null;
  /** Re-resolves a whole multi-selection against the current preview document. */
  refreshDomEditGroupSelectionsFromPreview: (selections: DomEditSelection[]) => Promise<void>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: { revealPanel?: boolean; preserveGroup?: boolean },
  ) => void;
  buildDomSelectionFromTarget: (element: HTMLElement) => Promise<DomEditSelection | null>;
  refreshPreviewDocumentVersion: () => void;
  syncPreviewHotkeys: (iframe: HTMLIFrameElement | null) => void;
  applyStudioManualEditsToPreviewRef: React.MutableRefObject<
    (iframe: HTMLIFrameElement) => Promise<void>
  >;
  openSourceForSelection?: (sourceFile: string, target: PatchTarget) => void;
  getSidebarTab?: () => SidebarTab;
  gsapCacheVersion?: number;
}

export function useDomEditPreviewSync({
  previewIframe,
  activeCompPath,
  captionEditMode,
  domEditSelectionRef,
  domEditGroupSelectionsRef,
  domEditSelection,
  applyDomSelection,
  refreshDomEditGroupSelectionsFromPreview,
  buildDomSelectionFromTarget,
  refreshPreviewDocumentVersion,
  syncPreviewHotkeys,
  applyStudioManualEditsToPreviewRef,
  openSourceForSelection,
  getSidebarTab,
  gsapCacheVersion,
}: UseDomEditPreviewSyncParams): void {
  // Sync selection from preview document on load / refresh
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!previewIframe) return;
    let disposed = false;
    let syncSequence = 0;

    // fallow-ignore-next-line complexity
    const syncSelectionFromDocument = async () => {
      if (captionEditMode) return;
      const currentSelection = domEditSelectionRef.current;
      if (!currentSelection) return;
      let doc: Document | null = null;
      try {
        doc = previewIframe.contentDocument;
      } catch {
        return;
      }
      if (!doc) return;
      const sequence = ++syncSequence;

      reapplyPositionEditsAfterSeek(doc);

      const nextElement = findElementForSelection(doc, currentSelection, activeCompPath);
      if (!nextElement) {
        if (
          currentSelection.element.hasAttribute("data-source-window") &&
          (doc.defaultView as (Window & { __renderReady?: boolean }) | null)?.__renderReady !== true
        )
          return;
        // The selected element no longer resolves in the (re-synced) document
        // — comp/hot reload, activeCompPath swap, or post-save replacement.
        // Clear so overlay geometry isn't computed on a stale, detached node.
        // (Drag-release-in-gray-zone is handled separately by
        // suppressNextBoxClickRef; the dragged element still resolves here.)
        //
        // One lost member is not the whole selection though. A multi-select that
        // loses its primary here used to be wiped entirely, so moving a group and
        // having any one of its elements fail to re-resolve deselected all of
        // them. Re-resolve the group instead and keep whoever survived; it only
        // clears when nobody did.
        const group = domEditGroupSelectionsRef.current;
        logSelect("preview-sync-lost", {
          target: currentSelection.selector ?? currentSelection.id ?? null,
          group: group.length,
        });
        if (group.length > 1) {
          await refreshDomEditGroupSelectionsFromPreview(group);
          return;
        }
        applyDomSelection(null, { revealPanel: false });
        return;
      }

      const nextSelection = await buildDomSelectionFromTarget(nextElement);
      // Resolving source capabilities can outlive a reload, a newer selection,
      // or this effect. Never restore a target from the superseded document.
      if (
        !disposed &&
        sequence === syncSequence &&
        domEditSelectionRef.current === currentSelection &&
        previewIframe.contentDocument === doc &&
        nextSelection?.element.isConnected
      ) {
        applyDomSelection(nextSelection, { revealPanel: false, preserveGroup: true });
      }
    };

    syncPreviewHotkeys(previewIframe);
    void applyStudioManualEditsToPreviewRef.current(previewIframe);
    void syncSelectionFromDocument();
    refreshPreviewDocumentVersion();

    const handleLoad = () => {
      syncPreviewHotkeys(previewIframe);
      void applyStudioManualEditsToPreviewRef.current(previewIframe);
      void syncSelectionFromDocument();
      refreshPreviewDocumentVersion();
    };

    const handleReady = (event: MessageEvent) => {
      // A slow external composition can settle after the one-shot post-load
      // refresh has been consumed. Resume on runtime readiness, not a timer.
      if (
        event.source !== previewIframe.contentWindow ||
        !isPreviewReadinessMessage(event, previewIframe)
      )
        return;
      const selection = domEditSelectionRef.current;
      const doc = previewIframe.contentDocument;
      if (
        !selection?.element.hasAttribute("data-source-window") ||
        !doc ||
        (doc.defaultView as (Window & { __renderReady?: boolean }) | null)?.__renderReady !== true
      )
        return;
      if (selection.element.ownerDocument === doc && selection.element.isConnected) return;
      void syncSelectionFromDocument();
    };

    previewIframe.addEventListener("load", handleLoad);
    window.addEventListener("message", handleReady);
    return () => {
      disposed = true;
      previewIframe.removeEventListener("load", handleLoad);
      window.removeEventListener("message", handleReady);
    };
  }, [
    activeCompPath,
    applyDomSelection,
    buildDomSelectionFromTarget,
    captionEditMode,
    domEditGroupSelectionsRef,
    domEditSelectionRef,
    previewIframe,
    refreshDomEditGroupSelectionsFromPreview,
    refreshPreviewDocumentVersion,
    syncPreviewHotkeys,
    applyStudioManualEditsToPreviewRef,
    gsapCacheVersion,
  ]);

  // Auto-reveal source when an element is selected while the Code tab is active.
  // Use a ref for the callback so the effect only fires on selection changes,
  // not when openSourceForSelection is recreated due to editingFile content updates.
  const openSourceRef = useRef(openSourceForSelection);
  openSourceRef.current = openSourceForSelection;
  useEffect(
    // fallow-ignore-next-line complexity
    () => {
      if (!domEditSelection || !openSourceRef.current || !getSidebarTab) return;
      if (!domEditSelection.sourceFile) return;
      if (getSidebarTab() !== "code") return;
      openSourceRef.current(domEditSelection.sourceFile, {
        id: domEditSelection.id,
        selector: domEditSelection.selector,
        selectorIndex: domEditSelection.selectorIndex,
      });
    },
    [domEditSelection, getSidebarTab],
  );
}
