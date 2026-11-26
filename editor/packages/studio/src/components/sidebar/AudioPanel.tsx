// Audio panel (St-Music, St-M-Music): the project's audio files with play, "Adaugă" (at the
// playhead) or "Adăugat", search, and "Importă audio". Same actions as the Media rows.
import { memo, useMemo, useRef, useState } from "react";
import { illustrationSrc } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { AUDIO_EXT } from "../../utils/mediaTypes";
import { AudioRow } from "./AudioRow";
import { ImportQueue, useImportQueue, type ImportFilesHandler } from "./ImportQueue";
import {
  PanelBody,
  PanelCard,
  PanelIconButton,
  PanelMessage,
  PanelPill,
  PanelSearch,
} from "./panelKit";
import { searchAssets } from "./AssetsTab";
import {
  useCopyFeedback,
  useFileDropZone,
  useMediaManifest,
  useUsedAssetPaths,
} from "./useMediaLibrary";

export interface AudioPanelProps {
  projectId: string;
  assets: string[];
  onImport?: ImportFilesHandler;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAssetToTimeline?: (path: string) => void;
}

export const AudioPanel = memo(function AudioPanel({
  projectId,
  assets,
  onImport,
  onDelete,
  onRename,
  onAddAssetToTimeline,
}: AudioPanelProps) {
  useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const manifest = useMediaManifest(projectId, assets);
  const usedPaths = useUsedAssetPaths();
  const copy = useCopyFeedback();
  const uploads = useImportQueue(onImport, assets);
  const drop = useFileDropZone((files) => void uploads.importFiles(files));
  const audio = useMemo(() => assets.filter((a) => AUDIO_EXT.test(a)), [assets]);
  const visible = useMemo(() => searchAssets(audio, query, manifest), [audio, query, manifest]);
  const openPicker = onImport ? () => fileInputRef.current?.click() : undefined;

  return (
    <PanelCard
      title={t("panelAudio.title")}
      dropProps={onImport ? drop.dropProps : undefined}
      dropActive={drop.active}
      actions={
        openPicker ? (
          <PanelIconButton
            icon="upload"
            label={t("panelAudio.import")}
            disabled={uploads.importing}
            onClick={openPicker}
          />
        ) : undefined
      }
      footer={
        openPicker ? (
          <PanelPill
            icon="plus"
            className="w-full"
            disabled={uploads.importing}
            onClick={openPicker}
          >
            {uploads.importing ? t("media.importing") : t("panelAudio.import")}
          </PanelPill>
        ) : undefined
      }
    >
      {onImport && (
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void uploads.importFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
      )}
      <PanelSearch value={query} onChange={setQuery} label={t("panelAudio.search")} />
      <PanelBody>
        <ImportQueue entries={uploads.entries} />
        {visible.length === 0 && uploads.entries.length === 0 ? (
          query ? (
            <PanelMessage
              title={t("media.noMatch", { query })}
              action={
                <PanelPill size={34} onClick={() => setQuery("")}>
                  {t("media.clearSearch")}
                </PanelPill>
              }
            />
          ) : (
            <PanelMessage
              illustration={illustrationSrc("studio-media-empty")}
              title={t("panelAudio.empty")}
            />
          )
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((a) => (
              <AudioRow
                key={a}
                variant="music"
                projectId={projectId}
                asset={a}
                used={usedPaths.has(a)}
                meta={manifest.get(a)}
                onCopy={copy.copyPath}
                copyFeedback={copy.copyFeedback}
                onDelete={onDelete}
                onRename={onRename}
                onAddAssetToTimeline={onAddAssetToTimeline}
              />
            ))}
          </div>
        )}
      </PanelBody>
    </PanelCard>
  );
});
