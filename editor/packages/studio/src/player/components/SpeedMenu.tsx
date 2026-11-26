import { useState, useCallback, memo } from "react";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { t, useLocale } from "../../i18n/translate";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import {
  MENU_ROW,
  OutlinePill,
  POPOVER_MENU,
  PreviewIcon,
} from "../../components/nle/preview/previewChrome";
import { formatRate } from "./transport/transportFormat";
import { SPEED_OPTIONS } from "./speedOptions";

// Re-exported so existing importers keep their path.
export { SPEED_OPTIONS };

interface SpeedMenuProps {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  disabled: boolean;
}

/** "1×" pill that opens the 150px speed menu above the transport (St-Preview-Speed). */
export const SpeedMenu = memo(function SpeedMenu({
  playbackRate,
  setPlaybackRate,
  disabled,
}: SpeedMenuProps) {
  const locale = useLocale();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const closeMenu = useCallback(() => setShowSpeedMenu(false), []);
  // Ref on the container (trigger + menu) so trigger clicks toggle instead of
  // close-then-reopen; Escape also dismisses.
  const speedMenuContainerRef = useContextMenuDismiss(closeMenu);

  return (
    <div ref={speedMenuContainerRef} className="relative flex-shrink-0">
      <OutlinePill
        height={30}
        selected={showSpeedMenu}
        onClick={() => setShowSpeedMenu((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={showSpeedMenu}
        aria-label={t("preview.speed")}
        title={t("preview.speed")}
        className="!px-2.5"
      >
        {formatRate(playbackRate, locale)}
      </OutlinePill>
      {showSpeedMenu && (
        <div
          role="menu"
          aria-label={t("preview.speedOptions")}
          className={`absolute bottom-full left-[19px] z-50 mb-[4px] w-[150px] ${POPOVER_MENU}`}
        >
          {SPEED_OPTIONS.map((rate) => {
            const isCurrent = rate === playbackRate;
            return (
              <button
                key={rate}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent}
                onClick={() => {
                  trackStudioEvent("playback", { action: "speed_change", rate });
                  setPlaybackRate(rate);
                  setShowSpeedMenu(false);
                }}
                className={`${MENU_ROW} ${isCurrent ? "bg-[var(--st-sub)] font-semibold" : ""}`}
              >
                <span className="flex w-3.5 flex-none">
                  {isCurrent ? <PreviewIcon name="check" size={14} strokeWidth={2.4} /> : null}
                </span>
                <span className="flex-1">{formatRate(rate, locale)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
