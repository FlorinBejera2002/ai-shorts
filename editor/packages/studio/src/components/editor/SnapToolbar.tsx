import { memo, useCallback, useRef, useState } from "react";
import { writeStudioUiPreferences } from "../../utils/studioUiPreferences";
import { usePlayerStore } from "../../player/store/playerStore";
import { t, useLocale } from "../../i18n/translate";
import { useIsPhone } from "../shell/useIsPhone";
import { PhoneSheet } from "../shell/PhoneSheet";
import { setPreviewPanel, usePreviewPanel } from "../nle/preview/previewUiStore";
import { useDismissOnOutside } from "../shell/useDismissOnOutside";
import { readSnapPrefs, type SnapPrefs } from "./snapPrefs";
import { GridOptionsFields, SnapGridPopover } from "./SnapGridOptions";
import { SnapToolbarButtons } from "./SnapToolbarButtons";
import { useSnapShortcuts } from "./useSnapShortcuts";
import { isSnapBarSticky, snapBarClassName, snapBarSizes, snapBarStyle } from "./snapBarLayout";

export type { SnapPrefs } from "./snapPrefs";

interface SnapToolbarProps {
  onSnapChange?: (prefs: SnapPrefs) => void;
  /** Shows the record button while an element is selected (gesture recording needs a target). */
  canRecord?: boolean;
  recording?: boolean;
  onToggleRecording?: () => void;
}

/**
 * Magnet and grid bar over the canvas corner (St-Preview-SnapBar): snap (S), grid (G), grid
 * options, motion destination when the selection can take a path, and gesture recording.
 * On phone the bar shows only while "Grilă și magnet" is open, with the options in a sheet
 * (St-M-Preview-Grid).
 */
export const SnapToolbar = memo(function SnapToolbar({
  onSnapChange,
  canRecord = false,
  recording = false,
  onToggleRecording,
}: SnapToolbarProps) {
  useLocale();
  const isPhone = useIsPhone();
  const panel = usePreviewPanel();
  const [prefs, setPrefs] = useState(readSnapPrefs);
  const gridPopoverOpen = panel === "gridOptions";
  // Motion-path "set destination" toggle — shown only when the selected element
  // can take a path; arms a single canvas click to place it (MotionPathOverlay).
  const motionPathCreateAvailable = usePlayerStore((s) => s.motionPathCreateAvailable);
  const motionPathArmed = usePlayerStore((s) => s.motionPathArmed);
  const setMotionPathArmed = usePlayerStore((s) => s.setMotionPathArmed);
  const popoverRef = useRef<HTMLDialogElement>(null);
  const gridButtonRef = useRef<HTMLButtonElement>(null);

  const updatePrefs = useCallback(
    (patch: Partial<SnapPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        writeStudioUiPreferences(patch);
        onSnapChange?.(next);
        return next;
      });
    },
    [onSnapChange],
  );

  const closePopover = useCallback(() => {
    if (gridPopoverOpen) setPreviewPanel(null);
  }, [gridPopoverOpen]);
  useDismissOnOutside(gridPopoverOpen, [popoverRef, gridButtonRef], closePopover);
  useSnapShortcuts(updatePrefs);

  const phoneSheetOpen = panel === "phoneGrid";
  if (isPhone && !phoneSheetOpen) return null;
  // While a gesture records, the timer chip and stop pill own the canvas (St-Preview-Gesture).
  // While the motion destination is armed its pill owns the top of the canvas and disarms it
  // (St-Preview-MotionArmed).
  if (!isPhone && (recording || motionPathArmed)) return null;

  // Desktop: the bar appears while the pointer is over the preview, and stays while it is in use
  // (St-Main shows a clean canvas; St-Preview-SnapBar shows the bar).
  const sticky = isSnapBarSticky({
    gridPopoverOpen,
    gridVisible: prefs.gridVisible,
    recording,
    motionPathArmed,
  });
  const { button: buttonSize, icon: iconSize } = snapBarSizes(isPhone);

  return (
    <>
      <div
        className={snapBarClassName(isPhone, sticky)}
        style={snapBarStyle(isPhone)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <SnapToolbarButtons
          isPhone={isPhone}
          snapEnabled={prefs.snapEnabled}
          gridVisible={prefs.gridVisible}
          onToggleSnap={() => updatePrefs({ snapEnabled: !prefs.snapEnabled })}
          onToggleGrid={() => updatePrefs({ gridVisible: !prefs.gridVisible })}
          gridPopoverOpen={gridPopoverOpen}
          gridButtonRef={gridButtonRef}
          onToggleGridPopover={() => setPreviewPanel(gridPopoverOpen ? null : "gridOptions")}
          motionPathCreateAvailable={motionPathCreateAvailable}
          motionPathArmed={motionPathArmed}
          onToggleMotionPath={() => setMotionPathArmed(!motionPathArmed)}
          canRecord={canRecord}
          recording={recording}
          onToggleRecording={onToggleRecording}
          buttonSize={buttonSize}
          iconSize={iconSize}
        />
        {!isPhone && gridPopoverOpen && (
          <SnapGridPopover dialogRef={popoverRef} prefs={prefs} onChange={updatePrefs} />
        )}
      </div>
      {isPhone && (
        <PhoneSheet
          open={phoneSheetOpen}
          onClose={() => setPreviewPanel(null)}
          title={t("preview.gridOptions")}
        >
          <div className="flex flex-col gap-4 px-4 pb-[56px] pt-1.5">
            <GridOptionsFields prefs={prefs} onChange={updatePrefs} phone />
          </div>
        </PhoneSheet>
      )}
    </>
  );
});
