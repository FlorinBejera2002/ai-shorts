import { memo, useCallback, useRef, useState } from "react";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { t, useLocale } from "../../i18n/translate";
import { useContextMenuDismiss } from "../../hooks/useContextMenuDismiss";
import { useMountEffect } from "../../hooks/useMountEffect";
import {
  POPOVER_PANEL,
  PreviewIcon,
  PreviewIconButton,
} from "../../components/nle/preview/previewChrome";
import { volumeIconName } from "./volumeIcon";

interface VolumeControlProps {
  audioMuted: boolean;
  audioVolume: number;
  disabled: boolean;
  setAudioMuted: (muted: boolean) => void;
  setAudioVolume: (volume: number) => void;
  /** Phone: the button opens the "Redare" sheet instead of the popover. */
  onOpenSheet?: () => void;
  size?: 36 | 40 | 44;
  /** White glyph for the fullscreen bar over video. */
  inverted?: boolean;
}

type VolumeSliderProps = Omit<VolumeControlProps, "onOpenSheet" | "size" | "inverted">;

/** Labelled 0–100 range with the board's 4px track and 18px ring thumb. */
export function VolumeSlider({
  audioMuted,
  audioVolume,
  disabled,
  setAudioMuted,
  setAudioVolume,
}: VolumeSliderProps) {
  useLocale();
  const percentage = Math.round(audioVolume * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-studio-text">{t("preview.volume")}</span>
        <span className="font-semibold tabular-nums text-studio-muted">{percentage}%</span>
      </div>
      <div className="relative h-4">
        <span className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-[var(--st-hd)]" />
        <span
          className="absolute left-0 top-1.5 h-1 rounded-full bg-studio-text"
          style={{ width: `${percentage}%` }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-px h-[18px] w-[18px] rounded-full bg-studio-surface shadow-[0_0_0_2px_var(--st-tx)]"
          style={{ left: `calc(${percentage}% - 9px)` }}
        />
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={percentage}
          disabled={disabled}
          aria-label={t("preview.volume")}
          aria-valuetext={`${percentage}%`}
          onChange={(event) => {
            const volume = Number(event.currentTarget.value) / 100;
            setAudioVolume(volume);
            if (audioMuted && volume > 0) setAudioMuted(false);
          }}
          className="absolute inset-0 h-4 w-full cursor-pointer opacity-0 disabled:pointer-events-none"
        />
      </div>
    </div>
  );
}

/**
 * Non-modal volume popover. `<dialog>` is shown on mount; `show()` keeps it non-modal so the
 * transport stays usable, and the container's outside-press dismissal still closes it.
 */
function VolumePopover(props: VolumeSliderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useMountEffect(() => {
    dialogRef.current?.show();
  });
  // The class list resets the UA dialog box: no margin or border, and no default left inset.
  return (
    <dialog
      ref={dialogRef}
      aria-label={t("preview.volume")}
      className={`absolute bottom-full right-[-160px] left-auto z-50 mx-0 mb-[61px] mt-0 w-[250px] border-0 ${POPOVER_PANEL}`}
    >
      <VolumeSlider {...props} />
    </dialog>
  );
}

/**
 * Transport volume button (St-Preview-Volume / St-Preview-Muted). When audible, a click opens the
 * volume popover; when silent the button unmutes (restoring an audible level from zero) and
 * opens the popover so the level can be adjusted.
 */
export const VolumeControl = memo(function VolumeControl(props: VolumeControlProps) {
  const {
    audioMuted,
    audioVolume,
    disabled,
    setAudioMuted,
    setAudioVolume,
    onOpenSheet,
    size = 36,
    inverted = false,
  } = props;
  useLocale();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const containerRef = useContextMenuDismiss(close);
  const silent = audioMuted || audioVolume === 0;
  const label = silent ? t("preview.unmute") : t("preview.volume");

  const handleClick = () => {
    if (silent && !onOpenSheet) {
      trackStudioEvent("playback", { action: "mute_toggle", muted: false });
      if (audioVolume === 0) setAudioVolume(1);
      setAudioMuted(false);
      setOpen(true);
      return;
    }
    if (onOpenSheet) {
      onOpenSheet();
      return;
    }
    setOpen((value) => !value);
  };

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      <PreviewIconButton
        label={label}
        size={size}
        tone={open ? "selected" : "plain"}
        onClick={handleClick}
        disabled={disabled}
        aria-expanded={onOpenSheet ? undefined : open}
        aria-pressed={silent}
        className={
          inverted && !open
            ? "!text-white hover:!bg-[color-mix(in_srgb,white_16%,transparent)]"
            : undefined
        }
      >
        <PreviewIcon name={volumeIconName(audioMuted, audioVolume)} />
      </PreviewIconButton>
      {open && (
        <VolumePopover
          audioMuted={audioMuted}
          audioVolume={audioVolume}
          disabled={disabled}
          setAudioMuted={setAudioMuted}
          setAudioVolume={setAudioVolume}
        />
      )}
    </div>
  );
});
