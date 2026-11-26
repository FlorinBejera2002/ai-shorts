// Phone tool bar and the sheets it opens: the side panel (Text, Audio, Elemente, Media…),
// the subtitle editor (through the inspector sheet) and the "Mai mult" sheet.
import { useState, type ReactNode } from "react";
import { usePanelLayoutContext } from "../../contexts/PanelLayoutContext";
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import type { AgentRecordEdit } from "../agent/useAgentRun";
import type { SidebarTab } from "../sidebar/LeftSidebar";
import { PhoneMoreSheet, type PhoneMoreRow } from "./PhoneMoreSheet";
import { PhoneSheet } from "./PhoneSheet";
import { PhoneToolBar, type PhoneToolId } from "./PhoneToolBar";
import { railItem, type RailItemId } from "./railItems";
import { enterCaptionEditing, type useRailNavigation } from "./useRailNavigation";

type RailNavigation = ReturnType<typeof useRailNavigation>;

export interface PhoneLeftToolsProps {
  rail: RailNavigation;
  recordEdit?: AgentRecordEdit;
  lintFindingCount?: number;
  onLint: () => void;
  /** Renders the side panel inside the sheet. */
  renderPanel: () => ReactNode;
}

const TOOL_RAIL: Partial<Record<PhoneToolId, RailItemId>> = {
  text: "text",
  audio: "audio",
  elements: "elements",
  subtitles: "subtitles",
};

/** Side panel rail item a phone tool opens as a sheet (edit and more have none). */
export function railForPhoneTool(id: PhoneToolId): RailItemId | null {
  return TOOL_RAIL[id] ?? null;
}

export function PhoneLeftTools({
  rail,
  recordEdit,
  lintFindingCount,
  onLint,
  renderPanel,
}: PhoneLeftToolsProps) {
  useLocale();
  const { setRightPanelTab, setRightCollapsed } = usePanelLayoutContext();
  const [tool, setTool] = useState<PhoneToolId>("edit");
  const [panelOpen, setPanelOpen] = useState(false);
  // Sheet title when it differs from the rail item ("Compoziții" under Avansat).
  const [panelTitle, setPanelTitle] = useState<MessageKey | null>(null);
  const closeAll = () => {
    setPanelOpen(false);
    setTool("edit");
  };

  const openPanel = (id: RailItemId, tab?: SidebarTab, title?: MessageKey) => {
    rail.select(id, { panelOnly: true, tab });
    setPanelTitle(title ?? null);
    setPanelOpen(true);
  };

  const selectTool = (id: PhoneToolId) => {
    setTool(id);
    if (id === "edit") {
      setPanelOpen(false);
      return;
    }
    if (id === "more") return;
    if (id === "subtitles" && enterCaptionEditing()) {
      // With captions in the project, the subtitle editor opens in the inspector.
      setRightCollapsed(false);
      setTool("edit");
      return;
    }
    const railId = railForPhoneTool(id);
    if (railId) openPanel(railId);
  };

  const openInspectorTab = (tab: "renders" | "layers") => {
    setRightPanelTab(tab);
    setRightCollapsed(false);
  };

  const moreRows: PhoneMoreRow[] = [
    { id: "media", icon: "media", label: "shell.tabMedia", onSelect: () => openPanel("media") },
    {
      id: "layers",
      icon: "layers",
      label: "shell.tabLayers",
      onSelect: () => openInspectorTab("layers"),
    },
    {
      id: "compositions",
      icon: "elements",
      label: "shell.moreCompositions",
      // St-M-Shell-PhoneComps: the compositions list under Avansat, not the Layers pane.
      onSelect: () => openPanel("advanced", "compositions", "shell.moreCompositions"),
    },
    { id: "code", icon: "code", label: "shell.moreCode", onSelect: () => openPanel("advanced") },
    {
      id: "lint",
      icon: "lint",
      label: "shell.moreLint",
      count: lintFindingCount,
      onSelect: onLint,
    },
    {
      id: "renders",
      icon: "render",
      label: "shell.moreRenders",
      onSelect: () => openInspectorTab("renders"),
    },
  ];

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[6]">
        <PhoneToolBar active={tool} onSelect={selectTool} />
      </div>
      <PhoneSheet
        open={panelOpen}
        onClose={closeAll}
        title={t(panelTitle ?? railItem(rail.active).label)}
        tall
      >
        <div className="flex min-h-0 flex-1 [&>*]:!h-full [&>*]:!w-full">{renderPanel()}</div>
      </PhoneSheet>
      <PhoneMoreSheet
        open={tool === "more"}
        onClose={() => setTool("edit")}
        recordEdit={recordEdit}
        rows={moreRows}
      />
    </>
  );
}
