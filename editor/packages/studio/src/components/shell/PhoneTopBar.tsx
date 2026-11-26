// Phone top bar, 56px: back, title with the save state under it, undo, redo, Inspector, export.
import type { ReactNode } from "react";
import { t, useLocale } from "../../i18n/translate";
import { StudioBackButton } from "../StudioBackButton";
import { HistoryButtons, shellToggleButton } from "./HistoryButtons";
import { SaveStateText } from "./SaveStateChip";
import type { SaveStatus } from "./saveStatus";
import { ShellIcon } from "./ShellIcon";

export interface PhoneTopBarProps {
  titleField: ReactNode;
  saveStatus: SaveStatus;
  inspectorActive: boolean;
  onToggleInspector: () => void;
  onExport: () => void;
  isRendering: boolean;
}

export function PhoneTopBar({
  titleField,
  saveStatus,
  inspectorActive,
  onToggleInspector,
  onExport,
  isRendering,
}: PhoneTopBarProps) {
  useLocale();
  return (
    <header className="relative z-[5] flex h-14 flex-none items-center gap-0.5 border-b border-studio-border bg-studio-surface px-2">
      <StudioBackButton variant="phone" />
      <span className="flex min-w-0 flex-1 flex-col gap-px pl-1">
        {titleField}
        <SaveStateText status={saveStatus} />
      </span>
      <HistoryButtons size="phone" />
      <button
        type="button"
        aria-label={t("shell.inspector")}
        title={t("shell.inspector")}
        aria-pressed={inspectorActive}
        onClick={onToggleInspector}
        className={`${shellToggleButton(inspectorActive)} h-11 w-11`}
      >
        <ShellIcon name="inspector" />
      </button>
      <button
        type="button"
        aria-label={isRendering ? t("shell.exporting") : t("shell.export")}
        title={isRendering ? t("shell.exporting") : t("shell.export")}
        disabled={isRendering}
        onClick={onExport}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-studio-accent text-studio-on-accent active:scale-[0.98] disabled:opacity-60"
      >
        <ShellIcon name="download" />
      </button>
    </header>
  );
}
