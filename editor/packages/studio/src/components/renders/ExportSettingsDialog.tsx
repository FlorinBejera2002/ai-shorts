// The header's Export opens these settings first (desktop: centred card; phone: bottom sheet).
// The form is the Renders tab's, prefilled with the last choices; its Export button closes the
// dialog and starts the render, whose progress and result follow in the export dialogs.
import { useStudioShellContext } from "../../contexts/StudioContext";
import { t, useLocale } from "../../i18n/translate";
import { OutputDialog } from "../output/OutputDialog";
import { closeExportSettings, useExportSettingsOpen } from "./exportSettingsDialogStore";
import { RenderExportForm, type StartRenderHandler } from "./RenderExportForm";
import { useStartRenderFromForm } from "./useStartRenderFromForm";

export function ExportSettingsDialog() {
  useLocale();
  const open = useExportSettingsOpen();
  const { compositionDimensions, renderQueue } = useStudioShellContext();
  const startRender = useStartRenderFromForm(true);
  if (!open) return null;

  const start: StartRenderHandler = (...settings) => {
    closeExportSettings();
    return startRender(...settings);
  };

  return (
    <OutputDialog
      open
      title={t("output.exportSettingsTitle")}
      onClose={closeExportSettings}
      width={440}
      raised
      testId="export-settings"
    >
      <RenderExportForm
        onStartRender={start}
        isRendering={renderQueue.isRendering}
        compositionDimensions={compositionDimensions}
        ffmpeg={renderQueue.ffmpeg}
        ffmpegChecking={renderQueue.ffmpegChecking}
        onRecheckFfmpeg={renderQueue.recheckFfmpeg}
      />
    </OutputDialog>
  );
}
