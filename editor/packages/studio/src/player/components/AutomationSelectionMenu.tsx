/**
 * Context menu for a right-click inside an automation time selection (St-Timeline-AutoMenu):
 * the four utility shapes, then Simplify. Rows never vanish: an inapplicable Simplify dims
 * with a reason instead of leaving a shorter menu.
 */
import { memo } from "react";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { AUTOMATION_SHAPES, type AutomationShapeId } from "./automationShapes";
import { TimelineMenuItem, TimelineMenuSurface } from "./TimelineMenu";
import type { TimelineIconName } from "./TimelineIcon";

const SHAPE_COPY: Record<AutomationShapeId, { key: MessageKey; icon: TimelineIconName }> = {
  "ramp-up": { key: "timeline.autoRampUp", icon: "arrow" },
  "ramp-down": { key: "timeline.autoRampDown", icon: "arrow" },
  swell: { key: "timeline.autoSwell", icon: "sparkle" },
  dip: { key: "timeline.autoDip", icon: "arrow" },
};

interface AutomationSelectionMenuProps {
  x: number;
  y: number;
  onClose(): void;
  onInsertShape(shape: AutomationShapeId): void;
  onSimplify(): void;
  /** At least three points in the range — fewer has nothing to thin. */
  canSimplify: boolean;
}

export const AutomationSelectionMenu = memo(function AutomationSelectionMenu({
  x,
  y,
  onClose,
  onInsertShape,
  onSimplify,
  canSimplify,
}: AutomationSelectionMenuProps) {
  useLocale();
  const menuRef = useContextMenuDismiss(onClose);
  return (
    // Portaled at z-200: the ruler's sticky header sits at z-70 in the same root stacking
    // context, so a lower menu opened near the top of the timeline is painted through.
    <TimelineMenuSurface
      ref={menuRef}
      role="group"
      className="hf-automation-menu"
      label={t("timeline.autoShapes")}
      title={t("timeline.autoVolume")}
      x={x}
      y={y}
      width={230}
      estimatedHeight={(AUTOMATION_SHAPES.length + 1) * 38 + 12}
      onDismiss={onClose}
    >
      {AUTOMATION_SHAPES.map((shape) => (
        <TimelineMenuItem
          key={shape.id}
          role="button"
          icon={SHAPE_COPY[shape.id].icon}
          onClick={() => {
            onInsertShape(shape.id);
            onClose();
          }}
        >
          {t(SHAPE_COPY[shape.id].key)}
        </TimelineMenuItem>
      ))}
      <TimelineMenuItem
        role="button"
        icon="sliders"
        disabled={!canSimplify}
        title={canSimplify ? undefined : t("timeline.autoSimplifyTip")}
        onClick={() => {
          onSimplify();
          onClose();
        }}
      >
        {t("timeline.autoSimplify")}
      </TimelineMenuItem>
    </TimelineMenuSurface>
  );
});
