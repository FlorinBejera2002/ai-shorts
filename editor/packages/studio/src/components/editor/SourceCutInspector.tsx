import { useState, type ReactNode } from "react";
import type { RecordEditInput } from "../../utils/studioFileHistory";
import { ClipAdjustments } from "./ClipAdjustments";
import { CutSoundEffect } from "./CutSoundEffect";
import { SourceCutCaptions } from "./SourceCutCaptions";
import { SourceCutMediaSettings } from "./SourceCutMediaSettings";
import { CutSettingsScopeProvider } from "./CutSettingsScope";
import type { DomEditSelection } from "./domEditingTypes";
import { ICON_PATHS, InspectorIcon } from "./inspectorControls";
import { t, useLocale } from "../../i18n/translate";

export function SourceCutInspector({
  selection,
  recordEdit,
  children,
}: {
  selection: DomEditSelection | null;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
  children: ReactNode;
}) {
  return (
    <CutSettingsScopeProvider selection={selection} recordEdit={recordEdit}>
      <SourceCutInspectorContent selection={selection} recordEdit={recordEdit}>
        {children}
      </SourceCutInspectorContent>
    </CutSettingsScopeProvider>
  );
}

function SourceCutInspectorContent({
  selection,
  recordEdit,
  children,
}: {
  selection: DomEditSelection | null;
  recordEdit: (entry: RecordEditInput) => Promise<void>;
  children: ReactNode;
}) {
  if (!selection?.element.hasAttribute("data-source-window")) return children;
  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto px-4 pt-1 pb-4 text-studio-text">
      <ClipAdjustments
        key={`${selection.sourceFile}:${selection.id}`}
        selection={selection}
        recordEdit={recordEdit}
      />
      <CutSoundEffect
        key={`sound:${selection.sourceFile}:${selection.id}`}
        selection={selection}
        recordEdit={recordEdit}
      />
      <SourceCutCaptions
        key={`captions:${selection.sourceFile}:${selection.id}`}
        selection={selection}
        recordEdit={recordEdit}
      />
      <SourceCutMediaSettings
        key={`media:${selection.sourceFile}:${selection.id}`}
        selection={selection}
        recordEdit={recordEdit}
      />
      <MoreClipSettings>{children}</MoreClipSettings>
    </div>
  );
}

/** St-Inspector-CutApply: the element inspector of the cut, folded under one row. */
function MoreClipSettings({ children }: { children: ReactNode }) {
  useLocale();
  // Mounted only while open, so the element inspector's title-row actions appear with it.
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group/more -mx-4 flex-none"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-4 text-[13px] font-semibold text-studio-text hover:bg-[var(--st-sub)] [&::-webkit-details-marker]:hidden">
        {t("more.title")}
        <span className="transition-transform group-open/more:rotate-90">
          <InspectorIcon d={ICON_PATHS.chevron} />
        </span>
      </summary>
      {open && <div className="h-[480px]">{children}</div>}
    </details>
  );
}
