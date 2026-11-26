// Rail selection: shows the item's side panel tab and opens the inspector pane it pairs with.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useCaptionStore } from "../../captions/store";
import { usePanelLayoutContext } from "../../contexts/PanelLayoutContext";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { getPersistedTab, type LeftSidebarHandle, type SidebarTab } from "../sidebar/LeftSidebar";
import {
  persistRailItem,
  railItem,
  railItemForTab,
  readPersistedRailItem,
  type RailItemId,
} from "./railItems";

function initialRailItem(): RailItemId {
  return railItemForTab(getPersistedTab(), readPersistedRailItem() ?? undefined);
}

/** Opens the subtitle editor when the composition has captions (same path as the preview pill). */
export function enterCaptionEditing(): boolean {
  const store = useCaptionStore.getState();
  if (!store.model) return false;
  store.setDismissed(false);
  store.setEditMode(true);
  return true;
}

export function useRailNavigation(leftSidebarRef: RefObject<LeftSidebarHandle | null>) {
  const { effectiveLeftCollapsed, toggleLeftSidebar, setRightCollapsed, setRightPanelTab } =
    usePanelLayoutContext();
  const [active, setActive] = useState<RailItemId>(initialRailItem);
  // The side panel mounts after an expand; its tab is applied once the ref is attached.
  const pendingTab = useRef<SidebarTab | null>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    if (!pendingTab.current || !leftSidebarRef.current) return;
    leftSidebarRef.current.selectTab(pendingTab.current);
    pendingTab.current = null;
  });

  const showTab = useCallback(
    (tab: SidebarTab) => {
      if (leftSidebarRef.current) leftSidebarRef.current.selectTab(tab);
      else pendingTab.current = tab;
    },
    [leftSidebarRef],
  );

  /**
   * Selects a rail item. `expand` opens a collapsed side panel (desktop rail); `panelOnly`
   * shows the side panel tab without opening the inspector pane the item pairs with; `tab`
   * shows another side panel tab under the item (Avansat → Compoziții).
   */
  const select = useCallback(
    (id: RailItemId, options: { expand?: boolean; panelOnly?: boolean; tab?: SidebarTab } = {}) => {
      const item = railItem(id);
      setActive(id);
      persistRailItem(id);
      trackStudioEvent("tab_switch", { panel: "rail", tab: id });
      showTab(options.tab ?? item.tab);
      if (options.expand && effectiveLeftCollapsed) toggleLeftSidebar();
      if (options.panelOnly) return;
      if (item.captions && enterCaptionEditing()) setRightCollapsed(false);
      if (item.layers) {
        setRightPanelTab("layers");
        setRightCollapsed(false);
      }
    },
    [effectiveLeftCollapsed, setRightCollapsed, setRightPanelTab, showTab, toggleLeftSidebar],
  );

  return { active, select };
}
