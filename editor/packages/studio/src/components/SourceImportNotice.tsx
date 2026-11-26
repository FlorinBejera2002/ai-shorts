import { useEffect, useState } from "react";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { useStudioShellContext } from "../contexts/StudioContext";
import { usePanelLayoutContext } from "../contexts/PanelLayoutContext";
import { t, useLocale } from "../i18n/translate";
import { useIsPhone } from "./shell/useIsPhone";
import { PreviewIcon, PreviewIconButton } from "./nle/preview/previewChrome";
import {
  EDITABLE_INDEX_PATH,
  ORIGINAL_EXPORT_PATH,
  OriginalVideoInspector,
  OriginalVideoSwitch,
} from "./nle/preview/OriginalVideoPanel";

/** `import-notes.txt` of a source-cut project; empty for every other project. */
function useImportNotes(): string {
  const { readOptionalProjectFile } = useFileManagerContext();
  const { projectId } = useStudioShellContext();
  const [notes, setNotes] = useState("");
  useEffect(() => {
    let cancelled = false;
    setNotes("");
    void readOptionalProjectFile("import-notes.txt")
      .then((text) => {
        if (!cancelled) setNotes(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, readOptionalProjectFile]);
  return notes;
}

/**
 * Source-cut projects (an imported SneepCut clip) carry `import-notes.txt` and an
 * `original-export.html` with the generated video. The preview moves between the editable clips
 * and the read-only original (St-Original, St-M-Preview-Original):
 * - `shell` (EditorShell): the "Video original" inspector panel while the original is shown;
 * - `header` (preview card header): a toggle that opens the original, hidden while the
 *   inspector panel already offers the switch;
 * - `sheet` (phone "Mai mult"): the full Clipuri editabile / Video original switch.
 * The import notes stay available as the tooltip.
 */
export function SourceImportNotice({
  placement = "shell",
}: {
  placement?: "shell" | "header" | "sheet";
}) {
  useLocale();
  const isPhone = useIsPhone();
  const notes = useImportNotes();
  const { activeCompPath, setActiveCompPath } = useStudioShellContext();
  const { effectiveRightCollapsed, setRightCollapsed } = usePanelLayoutContext();
  if (!notes) return null;
  const original = activeCompPath === ORIGINAL_EXPORT_PATH;
  const showOriginal = (value: boolean) => {
    setActiveCompPath(value ? ORIGINAL_EXPORT_PATH : EDITABLE_INDEX_PATH);
    // The details and the way back live in the inspector on desktop.
    if (value && !isPhone) setRightCollapsed(false);
  };

  if (placement === "shell") {
    return <OriginalVideoInspector original={original} notes={notes} onChange={showOriginal} />;
  }
  if (placement === "sheet") {
    return <OriginalVideoSwitch original={original} onChange={showOriginal} title={notes} />;
  }
  if (original && !effectiveRightCollapsed) return null;
  const label = original ? t("preview.backToClips") : t("preview.viewOriginal");
  return (
    <PreviewIconButton
      label={label}
      title={`${label}\n\n${notes}`}
      size={32}
      tone={original ? "selected" : "plain"}
      aria-pressed={original}
      data-source-import-switch=""
      onClick={() => showOriginal(!original)}
    >
      <PreviewIcon name="film" size={16} />
    </PreviewIconButton>
  );
}
