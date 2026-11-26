// Where the inspector goes: the 340px column on desktop (12px from the preview), a 40px rail
// when the window is too narrow (St-Shell-Narrow), nothing when the user hid it
// (St-Shell-InspectorOff), and a bottom sheet on phone.
import type { ReactNode } from "react";
import { usePanelLayoutContext } from "../../contexts/PanelLayoutContext";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { PhoneSheet } from "./PhoneSheet";
import { InspectorRail } from "./StudioRail";
import { useIsPhone } from "./useIsPhone";

export function InspectorSlot({ children }: { children: ReactNode }) {
  const isPhone = useIsPhone();
  const { rightCollapsed, effectiveRightCollapsed, setRightCollapsed, setRightPanelTab } =
    usePanelLayoutContext();

  if (isPhone) {
    return (
      <PhoneSheet open={!effectiveRightCollapsed} onClose={() => setRightCollapsed(true)} tall>
        <div className="flex min-h-0 flex-1 flex-col [&>div:last-child]:!h-full [&>div:last-child]:!max-h-none [&>div:last-child]:!rounded-none [&>div:last-child]:!border-0 [&>div:last-child]:!shadow-none">
          {children}
        </div>
      </PhoneSheet>
    );
  }
  if (!effectiveRightCollapsed) return <div className="flex flex-none pl-[9px]">{children}</div>;
  // The window railed the inspector away while the user still wants it: offer it back.
  if (!rightCollapsed) {
    return (
      <InspectorRail
        onShow={() => {
          trackStudioEvent("panel_toggle", { panel: "inspector", collapsed: false });
          setRightPanelTab("design");
          setRightCollapsed(false);
        }}
      />
    );
  }
  return null;
}
