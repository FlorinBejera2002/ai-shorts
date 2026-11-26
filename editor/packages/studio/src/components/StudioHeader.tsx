import { useRef, type MouseEvent } from "react";
import { useStudioShellContext } from "../contexts/StudioContext";
import { useViewMode, type StudioViewMode } from "../contexts/ViewModeContext";
import { t, useLocale } from "../i18n/translate";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { Tooltip } from "./ui";
import type { AgentRecordEdit } from "./agent/useAgentRun";
import { CanvasAspectSelect } from "./CanvasAspectSelect";
import { StudioBackButton } from "./StudioBackButton";
import { StudioSession } from "./StudioSession";
import { HistoryButtons, SHELL_ICON_BUTTON, shellToggleButton } from "./shell/HistoryButtons";
import { PhoneTopBar } from "./shell/PhoneTopBar";
import { ProjectTitleField } from "./shell/ProjectTitleField";
import { SaveStateChip } from "./shell/SaveStateChip";
import { ShellIcon } from "./shell/ShellIcon";
import { useSaveStatus } from "./shell/saveStatus";
import { useIsPhone } from "./shell/useIsPhone";
import { useProjectTitle } from "./shell/useProjectTitle";
import { useShellActions } from "./shell/useShellActions";

export { shouldOpenInspector } from "./shell/useShellActions";

export interface StudioHeaderProps {
  captureFrameHref: string;
  captureFrameFilename: string;
  handleCaptureFrameClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  refreshCaptureFrameTime: () => void;
  capturing?: boolean;
  inspectorButtonActive: boolean;
  inspectorPanelActive: boolean;
  /** The DOM-edit save queue is paused: the save state reads "Salvare eșuată". */
  savePaused?: boolean;
  onExport?: () => void;
  recordEdit?: AgentRecordEdit;
}

const VIEW_MODES: Array<{ mode: StudioViewMode; key: "shell.storyboard" | "shell.preview" }> = [
  { mode: "storyboard", key: "shell.storyboard" },
  { mode: "timeline", key: "shell.preview" },
];

/** Segmented control switching the main stage between storyboard and preview. */
export function ViewModeToggle({ className = "" }: { className?: string }) {
  useLocale();
  const { viewMode, setViewMode } = useViewMode();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectMode = (mode: StudioViewMode) => {
    if (mode === viewMode) return;
    if (setViewMode(mode)) trackStudioEvent("view_mode_toggle", { mode });
  };

  // Complete APG tabs pattern: roving tabIndex + arrow-key navigation.
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const dir = e.key === "ArrowLeft" ? -1 : 1;
    const next = (index + dir + VIEW_MODES.length) % VIEW_MODES.length;
    tabRefs.current[next]?.focus();
    selectMode(VIEW_MODES[next].mode);
  };

  return (
    <div
      role="tablist"
      aria-label={t("shell.viewMode")}
      className={`inline-flex flex-none gap-0.5 rounded-full bg-studio-surface p-[3px] shadow-[inset_0_0_0_1px_var(--st-bd)] ${className}`}
    >
      {VIEW_MODES.map(({ mode, key }, index) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => selectMode(mode)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`h-[30px] flex-none whitespace-nowrap rounded-full px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--st-tx)] ${
              active
                ? "bg-studio-selected text-studio-on-selected"
                : "text-[var(--st-t2)] hover:bg-[var(--st-sub)]"
            }`}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}

function SneepCutLogo() {
  return (
    <>
      <img
        src="/sneepcut-logo-color.svg"
        alt={t("shell.logoAlt")}
        className="block h-5 w-auto flex-none [[data-theme=dark]_&]:hidden"
      />
      <img
        src="/sneepcut-logo.svg"
        alt={t("shell.logoAlt")}
        className="hidden h-5 w-auto flex-none [[data-theme=dark]_&]:block"
      />
    </>
  );
}

interface CaptureButtonProps {
  href: string;
  filename: string;
  capturing?: boolean;
  onCapture: (event: MouseEvent<HTMLAnchorElement>) => void;
  onRefresh: () => void;
}

function CaptureFrameButton({
  href,
  filename,
  capturing,
  onCapture,
  onRefresh,
}: CaptureButtonProps) {
  const label = capturing ? t("shell.capturing") : t("shell.capture");
  return (
    <Tooltip label={label} side="bottom">
      <a
        href={href}
        download={filename}
        onClick={(e) => {
          if (capturing) {
            e.preventDefault();
            return;
          }
          trackStudioEvent("toolbar_action", { action: "capture_frame" });
          onCapture(e);
        }}
        onFocus={onRefresh}
        onPointerDown={onRefresh}
        aria-disabled={capturing || undefined}
        aria-label={label}
        className={`${SHELL_ICON_BUTTON} h-9 w-9 ${capturing ? "opacity-[0.38]" : ""}`}
      >
        {capturing ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        ) : (
          <ShellIcon name="capture" />
        )}
      </a>
    </Tooltip>
  );
}

export function StudioHeader(props: StudioHeaderProps) {
  useLocale();
  const isPhone = useIsPhone();
  const { projectId, showToast } = useStudioShellContext();
  const { title, commitTitle } = useProjectTitle(projectId);
  const saveStatus = useSaveStatus(Boolean(props.savePaused));
  const actions = useShellActions(props.inspectorPanelActive, props.onExport);
  const titleField = (
    <ProjectTitleField
      title={title}
      onCommit={commitTitle}
      onInvalid={() => showToast(t("shell.titleInvalid"), "error")}
      className={
        isPhone
          ? "h-5 w-full px-0 text-[15px] leading-5"
          : "h-9 min-w-[72px] max-w-[180px] shrink px-2 text-[15px] [field-sizing:content]"
      }
    />
  );

  if (isPhone) {
    return (
      <>
        <StudioSession />
        <PhoneTopBar
          titleField={titleField}
          saveStatus={saveStatus}
          inspectorActive={props.inspectorButtonActive}
          onToggleInspector={actions.toggleInspector}
          onExport={actions.startExport}
          isRendering={actions.isRendering}
        />
      </>
    );
  }

  return (
    <header className="relative z-[4] flex h-16 flex-none items-center gap-2.5 border-b border-studio-border bg-studio-surface px-4">
      <StudioSession />
      <span className="contents max-lg:hidden">
        <SneepCutLogo />
      </span>
      <span
        aria-hidden="true"
        className="mx-1 h-5 w-px flex-none bg-[var(--st-bd)] max-lg:hidden"
      />
      <StudioBackButton variant="desktop" />
      {titleField}
      <SaveStateChip status={saveStatus} />
      <ViewModeToggle />
      <span className="min-w-0 flex-1" />
      <HistoryButtons size="desktop" />
      <CaptureFrameButton
        href={props.captureFrameHref}
        filename={props.captureFrameFilename}
        capturing={props.capturing}
        onCapture={props.handleCaptureFrameClick}
        onRefresh={props.refreshCaptureFrameTime}
      />
      <Tooltip label={t("shell.inspector")} side="bottom">
        <button
          type="button"
          onClick={actions.toggleInspector}
          aria-pressed={props.inspectorButtonActive}
          aria-label={t("shell.inspector")}
          className={`${shellToggleButton(props.inspectorButtonActive)} h-9 w-9`}
        >
          <ShellIcon name="inspector" />
        </button>
      </Tooltip>
      {props.recordEdit && <CanvasAspectSelect recordEdit={props.recordEdit} />}
      <Tooltip label={actions.exportTooltip} side="bottom">
        <button
          type="button"
          disabled={actions.isRendering}
          onClick={actions.startExport}
          className="inline-flex h-10 min-w-[104px] flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-studio-accent px-5 text-[13px] font-semibold text-studio-on-accent transition-[filter,transform] enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShellIcon name="download" size={16} />
          {actions.isRendering ? t("shell.exporting") : t("shell.export")}
        </button>
      </Tooltip>
    </header>
  );
}
