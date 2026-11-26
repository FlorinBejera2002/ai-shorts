// The snap bar's button row: magnet, grid, grid options, motion destination and gesture record.
import type { ComponentProps, MouseEvent, RefObject } from "react";
import { t } from "../../i18n/translate";
import { PreviewIcon, PreviewIconButton } from "../nle/preview/previewChrome";

type IconName = ComponentProps<typeof PreviewIcon>["name"];

/** A pressed-state toggle; on phone an off toggle gets a plain surface so it still reads as a button. */
function SnapToggleButton({
  label,
  pressed,
  icon,
  isPhone,
  buttonSize,
  iconSize,
  onToggle,
  onContextMenu,
}: {
  label: string;
  pressed: boolean;
  icon: IconName;
  isPhone: boolean;
  buttonSize: 32 | 40;
  iconSize: 16 | 18;
  onToggle: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}) {
  return (
    <PreviewIconButton
      label={label}
      size={buttonSize}
      tone={pressed ? "selected" : "plain"}
      aria-pressed={pressed}
      onClick={onToggle}
      onContextMenu={onContextMenu}
      className={isPhone && !pressed ? "!bg-studio-surface shadow-studio" : ""}
    >
      <PreviewIcon name={icon} size={iconSize} />
    </PreviewIconButton>
  );
}

function GridPopoverButton({
  buttonRef,
  open,
  onToggle,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <PreviewIconButton
      ref={buttonRef}
      label={t("preview.gridOptions")}
      size={32}
      tone={open ? "selected" : "plain"}
      aria-expanded={open}
      onClick={onToggle}
    >
      <PreviewIcon name="chevronDown" size={16} />
    </PreviewIconButton>
  );
}

function MotionDestinationButton({ armed, onToggle }: { armed: boolean; onToggle: () => void }) {
  return (
    <PreviewIconButton
      label={t("preview.motionDestination")}
      title={armed ? t("preview.motionDestinationHint") : undefined}
      size={32}
      tone={armed ? "selected" : "plain"}
      aria-pressed={armed}
      onClick={onToggle}
    >
      <PreviewIcon name="arrowRight" size={16} />
    </PreviewIconButton>
  );
}

function RecordGestureButton({
  recording,
  onToggle,
}: {
  recording: boolean;
  onToggle: () => void;
}) {
  return (
    <PreviewIconButton
      label={recording ? t("preview.stopRecording") : t("preview.recordGesture")}
      size={32}
      aria-pressed={recording}
      onClick={onToggle}
      className={recording ? "!bg-[var(--st-danger)] !text-studio-on-accent" : ""}
    >
      <PreviewIcon name={recording ? "stop" : "record"} size={16} />
    </PreviewIconButton>
  );
}

interface SnapToolbarButtonsProps {
  isPhone: boolean;
  snapEnabled: boolean;
  gridVisible: boolean;
  onToggleSnap: () => void;
  onToggleGrid: () => void;
  gridPopoverOpen: boolean;
  gridButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleGridPopover: () => void;
  motionPathCreateAvailable: boolean;
  motionPathArmed: boolean;
  onToggleMotionPath: () => void;
  canRecord: boolean;
  recording: boolean;
  onToggleRecording?: () => void;
  buttonSize: 32 | 40;
  iconSize: 16 | 18;
}

/** The toolbar row. On phone it is a plain row; on desktop it is a pill with the extra tools. */
export function SnapToolbarButtons({
  isPhone,
  snapEnabled,
  gridVisible,
  onToggleSnap,
  onToggleGrid,
  gridPopoverOpen,
  gridButtonRef,
  onToggleGridPopover,
  motionPathCreateAvailable,
  motionPathArmed,
  onToggleMotionPath,
  canRecord,
  recording,
  onToggleRecording,
  buttonSize,
  iconSize,
}: SnapToolbarButtonsProps) {
  return (
    <div
      role="toolbar"
      aria-label={t("preview.snapAndGrid")}
      className={
        isPhone
          ? "flex items-center gap-2"
          : "flex items-center gap-0.5 rounded-full bg-studio-surface p-1 shadow-studio"
      }
    >
      <SnapToggleButton
        label={snapEnabled ? t("preview.snapOn") : t("preview.snapOff")}
        pressed={snapEnabled}
        icon="magnet"
        isPhone={isPhone}
        buttonSize={buttonSize}
        iconSize={iconSize}
        onToggle={onToggleSnap}
      />
      <SnapToggleButton
        label={gridVisible ? t("preview.gridOn") : t("preview.gridOff")}
        pressed={gridVisible}
        icon="grid"
        isPhone={isPhone}
        buttonSize={buttonSize}
        iconSize={iconSize}
        onToggle={onToggleGrid}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!isPhone) onToggleGridPopover();
        }}
      />
      {!isPhone && (
        <GridPopoverButton
          buttonRef={gridButtonRef}
          open={gridPopoverOpen}
          onToggle={onToggleGridPopover}
        />
      )}
      {!isPhone && motionPathCreateAvailable && (
        <MotionDestinationButton armed={motionPathArmed} onToggle={onToggleMotionPath} />
      )}
      {!isPhone && canRecord && onToggleRecording && (
        <RecordGestureButton recording={recording} onToggle={onToggleRecording} />
      )}
    </div>
  );
}
