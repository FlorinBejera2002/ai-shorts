import type { ReactNode } from "react";
import type { RecordEditInput } from "../../utils/studioFileHistory";
import { ClipAdjustments } from "./ClipAdjustments";
import { CutSoundEffect } from "./CutSoundEffect";
import { SourceCutCaptions } from "./SourceCutCaptions";
import { SourceCutMediaSettings } from "./SourceCutMediaSettings";
import { CutSettingsScopeProvider } from "./CutSettingsScope";
import type { DomEditSelection } from "./domEditingTypes";

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
    <div className="h-full min-h-0 overflow-y-auto bg-panel-bg text-panel-text-1">
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
      <details className="border-t border-neutral-800">
        <summary className="cursor-pointer px-3 py-3 text-xs text-neutral-300 hover:bg-neutral-800">
          More clip settings
        </summary>
        <div className="h-96">{children}</div>
      </details>
    </div>
  );
}
