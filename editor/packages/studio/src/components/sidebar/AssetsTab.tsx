// Media panel (St-Media, St-Shell-MediaFilters, St-Shell-MediaNoMatch, St-Shell-MediaRows,
// St-Shell-MediaDrop, St-Shell-Importing, St-Shell-Library*): search, Proiect / Toate,
// type and usage chips, the asset grid and rows, uploads and the "Importă media" footer.
import { memo, useState, useRef, useMemo } from "react";
import { illustrationSrc } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { MediaPanelHeader, CATEGORY_KEYS, type UsageFilter } from "./MediaPanelHeader";
import { MEDIA_EXT, FONT_EXT } from "../../utils/mediaTypes";
import { type MediaCategory, getCategory, basename, FILTER_ORDER } from "./assetHelpers";
import { AudioRow } from "./AudioRow";
import { GlobalAssetsView } from "./GlobalAssetsView";
import { AssetCard, FontRow } from "./AssetCard";
import { ImportQueue, useImportQueue, type ImportFilesHandler } from "./ImportQueue";
import {
  PanelBody,
  PanelCard,
  PanelIconButton,
  PanelMessage,
  PanelPill,
  PanelSection,
} from "./panelKit";
import {
  deriveUsedPaths,
  useCopyFeedback,
  useFileDropZone,
  useMediaManifest,
  useUsedAssetPaths,
  type ManifestRecord,
} from "./useMediaLibrary";

interface AssetsTabProps {
  projectId: string;
  assets: string[];
  onImport?: ImportFilesHandler;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAssetToTimeline?: (path: string) => void;
}

export type { UsageFilter } from "./MediaPanelHeader";
export { deriveUsedPaths };

/** Filter assets by whether the composition references them. Pure — unit-tested. */
export function filterByUsage(
  assets: string[],
  usedPaths: Set<string>,
  usageFilter: UsageFilter,
): string[] {
  if (usageFilter === "used") return assets.filter((a) => usedPaths.has(a));
  if (usageFilter === "unused") return assets.filter((a) => !usedPaths.has(a));
  return assets;
}

/** Count used vs unused over a media set. Pure — unit-tested. */
export function countUsage(
  assets: string[],
  usedPaths: Set<string>,
): { used: number; unused: number } {
  let used = 0;
  for (const a of assets) if (usedPaths.has(a)) used++;
  return { used, unused: assets.length - used };
}

/** Assets matching the query by file name or manifest description. Pure. */
export function searchAssets(
  assets: string[],
  query: string,
  manifest: Map<string, ManifestRecord>,
): string[] {
  if (!query) return assets;
  const q = query.toLowerCase();
  return assets.filter(
    (a) =>
      basename(a).toLowerCase().includes(q) ||
      Boolean(manifest.get(a)?.description?.toLowerCase().includes(q)),
  );
}

/** Groups by category, used assets first within each. Pure. */
export function groupAssets(assets: string[], usedPaths: Set<string>) {
  const groups: Record<MediaCategory, string[]> = { audio: [], images: [], video: [], fonts: [] };
  for (const a of assets) {
    const cat = getCategory(a);
    if (cat) groups[cat].push(a);
  }
  for (const cat of FILTER_ORDER) {
    groups[cat].sort((a, b) => Number(!usedPaths.has(a)) - Number(!usedPaths.has(b)));
  }
  return groups;
}

interface AssetListProps {
  projectId: string;
  categories: MediaCategory[];
  groups: Record<MediaCategory, string[]>;
  showHeadings: boolean;
  usedPaths: Set<string>;
  manifest: Map<string, ManifestRecord>;
  copy: ReturnType<typeof useCopyFeedback>;
  actions: Pick<AssetsTabProps, "onDelete" | "onRename" | "onAddAssetToTimeline">;
}

function AssetList({
  projectId,
  categories,
  groups,
  showHeadings,
  usedPaths,
  manifest,
  copy,
  actions,
}: AssetListProps) {
  const shared = { onCopy: copy.copyPath, copyFeedback: copy.copyFeedback, ...actions };
  const renderCategory = (cat: MediaCategory) => {
    const items = groups[cat];
    if (cat === "images" || cat === "video") {
      return (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
          {items.map((a) => (
            <AssetCard
              key={a}
              projectId={projectId}
              asset={a}
              used={usedPaths.has(a)}
              duration={manifest.get(a)?.duration}
              {...shared}
            />
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2.5">
        {items.map((a) =>
          cat === "audio" ? (
            <AudioRow
              key={a}
              projectId={projectId}
              asset={a}
              used={usedPaths.has(a)}
              meta={manifest.get(a)}
              {...shared}
            />
          ) : (
            <FontRow key={a} asset={a} used={usedPaths.has(a)} {...shared} />
          ),
        )}
      </div>
    );
  };
  return (
    <>
      {categories.map((cat) =>
        showHeadings ? (
          <PanelSection key={cat} title={t(CATEGORY_KEYS[cat])} count={groups[cat].length}>
            {renderCategory(cat)}
          </PanelSection>
        ) : (
          <div key={cat}>{renderCategory(cat)}</div>
        ),
      )}
    </>
  );
}

function DropTarget() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 rounded-[20px] border-[1.5px] border-dashed border-[var(--st-tx)] bg-[var(--st-sel-row)]">
      <img
        src={illustrationSrc("studio-drop")}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-[120px] w-[120px] object-contain"
      />
      <b className="text-sm font-semibold">{t("media.dropTitle")}</b>
    </div>
  );
}

// fallow-ignore-next-line complexity
export const AssetsTab = memo(function AssetsTab({
  projectId,
  assets,
  onImport,
  onDelete,
  onRename,
  onAddAssetToTimeline,
}: AssetsTabProps) {
  useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFilter, setActiveFilter] = useState<MediaCategory | "all">("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"local" | "global">("local");
  const manifest = useMediaManifest(projectId, assets);
  const usedPaths = useUsedAssetPaths();
  const copy = useCopyFeedback();
  const uploads = useImportQueue(onImport, assets);
  const drop = useFileDropZone((files) => void uploads.importFiles(files));

  // Header controls are gated on the unfiltered pool, so a no-match query keeps its input.
  const allMediaAssets = useMemo(
    () => assets.filter((a) => MEDIA_EXT.test(a) || FONT_EXT.test(a)),
    [assets],
  );
  const mediaAssets = useMemo(
    () =>
      searchAssets(filterByUsage(allMediaAssets, usedPaths, usageFilter), searchQuery, manifest),
    [allMediaAssets, usedPaths, usageFilter, searchQuery, manifest],
  );
  const groups = useMemo(() => groupAssets(mediaAssets, usedPaths), [mediaAssets, usedPaths]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: mediaAssets.length };
    for (const cat of FILTER_ORDER) c[cat] = groups[cat].length;
    return c;
  }, [mediaAssets, groups]);
  const usageCounts = useMemo(
    () => countUsage(allMediaAssets, usedPaths),
    [allMediaAssets, usedPaths],
  );
  const visibleCategories = (activeFilter === "all" ? FILTER_ORDER : [activeFilter]).filter(
    (c) => groups[c].length > 0,
  );
  const openPicker = onImport ? () => fileInputRef.current?.click() : undefined;
  const importLabel = uploads.importing ? t("media.importing") : t("media.import");

  const body = (() => {
    if (viewMode === "global") return <GlobalAssetsView searchQuery={searchQuery} />;
    if (mediaAssets.length === 0 && uploads.entries.length === 0) {
      return searchQuery ? (
        <PanelMessage
          title={t("media.noMatch", { query: searchQuery })}
          action={
            <PanelPill size={34} onClick={() => setSearchQuery("")}>
              {t("media.clearSearch")}
            </PanelPill>
          }
        />
      ) : (
        <PanelMessage
          illustration={illustrationSrc("studio-media-empty")}
          title={t("media.emptyTitle")}
        />
      );
    }
    return (
      <>
        <ImportQueue entries={uploads.entries} />
        <AssetList
          projectId={projectId}
          categories={visibleCategories}
          groups={groups}
          showHeadings={activeFilter === "all" && visibleCategories.length > 1}
          usedPaths={usedPaths}
          manifest={manifest}
          copy={copy}
          actions={{ onDelete, onRename, onAddAssetToTimeline }}
        />
      </>
    );
  })();

  return (
    <PanelCard
      title={t("media.title")}
      dropProps={onImport ? drop.dropProps : undefined}
      actions={
        openPicker ? (
          <PanelIconButton
            icon="upload"
            label={uploads.importing ? t("media.importing") : t("media.upload")}
            disabled={uploads.importing}
            onClick={openPicker}
          />
        ) : undefined
      }
      footer={
        openPicker && !drop.active ? (
          <PanelPill
            icon="plus"
            className="w-full"
            disabled={uploads.importing}
            aria-busy={uploads.importing}
            onClick={openPicker}
          >
            {importLabel}
          </PanelPill>
        ) : undefined
      }
    >
      {onImport && (
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*,audio/*,font/*,.ttf,.otf,.woff,.woff2"
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
      {drop.active ? (
        <DropTarget />
      ) : (
        <>
          <MediaPanelHeader
            scope={viewMode}
            onScopeChange={setViewMode}
            showFilters={viewMode === "local" && allMediaAssets.length > 0}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showSearch={allMediaAssets.length > 0 || viewMode === "global"}
            activeCategory={activeFilter}
            onCategoryChange={setActiveFilter}
            categoryCounts={counts}
            categoryOrder={FILTER_ORDER}
            usage={usageCounts.used > 0 && usageCounts.unused > 0 ? usageCounts : null}
            usageFilter={usageFilter}
            onUsageFilterChange={setUsageFilter}
          />
          <PanelBody>{body}</PanelBody>
        </>
      )}
    </PanelCard>
  );
});
