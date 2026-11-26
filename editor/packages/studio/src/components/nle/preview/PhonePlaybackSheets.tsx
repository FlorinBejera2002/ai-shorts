// Phone playback sheets (St-M-Preview-Speed, -MobileMore, -Tools, -Shortcuts): the controls that
// do not fit the phone transport row. The volume button opens "Redare"; its "Comenzi rapide"
// button opens "Mai mult", which leads to the tools, the shortcut reference and grid options.
import type { ReactNode } from "react";
import { t, useLocale } from "../../../i18n/translate";
import { usePlayerStore } from "../../../player/store/playerStore";
import { SPEED_OPTIONS } from "../../../player/components/SpeedMenu";
import { VolumeSlider } from "../../../player/components/VolumeControl";
import { formatRate } from "../../../player/components/transport/transportFormat";
import { PHONE_SHORTCUT_SECTIONS } from "../../../player/components/transport/shortcutSections";
import { ShortcutSectionList } from "../../../player/components/transport/ShortcutList";
import {
  JumpToFrameSection,
  WorkAreaSection,
} from "../../../player/components/transport/TransportTools";
import { PanelSectionTitle } from "../../../player/components/transport/ShortcutList";
import { PhoneSheet } from "../../shell/PhoneSheet";
import { Switch } from "../../ui";
import { OutlinePill, PreviewIcon, type PreviewIconName } from "./previewChrome";
import { setPreviewPanel, usePreviewPanel } from "./previewUiStore";
import { SourceImportNotice } from "../../SourceImportNotice";

function SheetBody({ children, className = "pb-2" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-4 px-4 ${className}`}>{children}</div>;
}

function SpeedSegment() {
  const locale = useLocale();
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <PanelSectionTitle>{t("preview.speedLabel")}</PanelSectionTitle>
      <div
        role="radiogroup"
        aria-label={t("preview.speed")}
        className="flex gap-0.5 rounded-full bg-studio-surface p-[3px] shadow-[inset_0_0_0_1px_var(--st-bd)]"
      >
        {SPEED_OPTIONS.map((rate) => {
          const checked = rate === playbackRate;
          return (
            <button
              key={rate}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => usePlayerStore.getState().setPlaybackRate(rate)}
              className={`h-9 flex-1 whitespace-nowrap rounded-full px-1 text-xs ${
                checked
                  ? "bg-studio-selected font-semibold text-studio-on-selected"
                  : "font-medium text-studio-muted"
              }`}
            >
              {formatRate(rate, locale)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PlaybackSheetContent({ onToggleFullscreen }: { onToggleFullscreen: () => void }) {
  const audioMuted = usePlayerStore((s) => s.audioMuted);
  const audioVolume = usePlayerStore((s) => s.audioVolume);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const { setAudioMuted, setAudioVolume, setLoopEnabled } = usePlayerStore.getState();
  return (
    <SheetBody className="pb-2 pt-1.5">
      <SpeedSegment />
      <VolumeSlider
        audioMuted={audioMuted}
        audioVolume={audioVolume}
        disabled={false}
        setAudioMuted={setAudioMuted}
        setAudioVolume={setAudioVolume}
      />
      <div className="flex min-h-10 items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-studio-text">{t("preview.loop")}</span>
        <Switch label={t("preview.loop")} checked={loopEnabled} onChange={setLoopEnabled} />
      </div>
      <div className="flex gap-2 pt-[70px]">
        <OutlinePill
          height={40}
          className="!h-11 !flex-1"
          onClick={() => {
            setPreviewPanel(null);
            onToggleFullscreen();
          }}
        >
          {t("preview.fullscreen")}
        </OutlinePill>
        <OutlinePill
          height={40}
          className="!h-11 !flex-1"
          onClick={() => setPreviewPanel("phoneMore")}
        >
          {t("preview.shortcuts")}
        </OutlinePill>
      </div>
    </SheetBody>
  );
}

function MoreRow({
  icon,
  title,
  summary,
  onClick,
}: {
  icon: PreviewIconName;
  title: string;
  summary?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-md bg-studio-surface px-3 py-3 text-left shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
    >
      <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)]">
        <PreviewIcon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[13px] font-semibold text-studio-text">{title}</b>
        {summary ? <span className="truncate text-xs text-studio-muted">{summary}</span> : null}
      </span>
    </button>
  );
}

function MoreSheetContent() {
  return (
    <SheetBody>
      <div className="flex justify-center empty:hidden">
        <SourceImportNotice placement="sheet" />
      </div>
      <MoreRow
        icon="keyboard"
        title={t("preview.shortcuts")}
        summary={t("preview.shortcutsSummary")}
        onClick={() => setPreviewPanel("phoneShortcuts")}
      />
      <MoreRow
        icon="tools"
        title={t("preview.tools")}
        summary={t("preview.toolsSummary")}
        onClick={() => setPreviewPanel("phoneTools")}
      />
      {/* Crop handles sit on the selected media; the row closes the sheet to reveal them. */}
      <MoreRow icon="crop" title={t("preview.crop")} onClick={() => setPreviewPanel(null)} />
      <MoreRow
        icon="grid"
        title={t("preview.gridAndSnap")}
        onClick={() => setPreviewPanel("phoneGrid")}
      />
    </SheetBody>
  );
}

function ToolsSheetContent({
  onSeek,
  disabled,
}: {
  onSeek: (time: number) => void;
  disabled: boolean;
}) {
  const duration = usePlayerStore((s) => s.duration);
  const inPoint = usePlayerStore((s) => s.inPoint);
  const outPoint = usePlayerStore((s) => s.outPoint);
  const { setInPoint, setOutPoint } = usePlayerStore.getState();
  return (
    <SheetBody className="pb-[36px] pt-1.5">
      <JumpToFrameSection disabled={disabled} duration={duration} onSeek={onSeek} />
      <WorkAreaSection
        inPoint={inPoint}
        outPoint={outPoint}
        setInPoint={setInPoint}
        setOutPoint={setOutPoint}
      />
    </SheetBody>
  );
}

export function PhonePlaybackSheets({
  onSeek,
  disabled,
  onToggleFullscreen,
}: {
  onSeek: (time: number) => void;
  disabled: boolean;
  onToggleFullscreen: () => void;
}) {
  useLocale();
  const panel = usePreviewPanel();
  const close = () => setPreviewPanel(null);
  return (
    <>
      <PhoneSheet open={panel === "phonePlayback"} onClose={close} title={t("preview.playback")}>
        <PlaybackSheetContent onToggleFullscreen={onToggleFullscreen} />
      </PhoneSheet>
      <PhoneSheet open={panel === "phoneMore"} onClose={close} title={t("preview.more")}>
        <MoreSheetContent />
      </PhoneSheet>
      <PhoneSheet open={panel === "phoneTools"} onClose={close} title={t("preview.tools")}>
        <ToolsSheetContent onSeek={onSeek} disabled={disabled} />
      </PhoneSheet>
      <PhoneSheet open={panel === "phoneShortcuts"} onClose={close} title={t("preview.shortcuts")}>
        <SheetBody>
          {PHONE_SHORTCUT_SECTIONS.map((section) => (
            <ShortcutSectionList key={section.id} section={section} />
          ))}
        </SheetBody>
      </PhoneSheet>
    </>
  );
}
