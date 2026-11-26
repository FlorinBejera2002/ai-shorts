// Elemente catalog (St-Shell-Categories, St-Shell-Blocks*, St-Shell-VFX, St-M-Shell-Categories).
// The Text and Subtitrări rail items open the same catalog narrowed to their categories.
import { memo, useEffect, useMemo } from "react";
import { illustrationSrc } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { useBlockCatalog } from "../../hooks/useBlockCatalog";
import { BLOCK_CATEGORIES, type BlockCategory } from "../../utils/blockCategories";
import { BlockCard, categoryLabel, type BlockPreviewInfo } from "./BlockCard";
import { useIsPhone } from "../shell/useIsPhone";
import {
  PanelBody,
  PanelCard,
  PanelChip,
  PanelChipGroup,
  PanelMessage,
  PanelPill,
  PanelSearch,
} from "./panelKit";

export type { BlockPreviewInfo } from "./BlockCard";

export type CatalogVariant = "elements" | "text" | "subtitles";

/** Categories each catalog entry shows. Elemente shows the whole registry. */
export const CATALOG_CATEGORIES: Record<CatalogVariant, readonly BlockCategory[] | null> = {
  elements: null,
  text: ["text-effects", "captions"],
  subtitles: ["captions"],
};

const TITLE_KEY = {
  elements: "elements.title",
  text: "elements.text",
  subtitles: "elements.subtitles",
} as const;

/**
 * Blocks with an "Adaugă" action that inserts them at the playhead; on desktop the others are
 * dragged onto the timeline. Phone has no timeline drag, so every block gets the action there.
 */
const ADDABLE: ReadonlySet<BlockCategory> = new Set([
  "vfx",
  "social",
  "scenes",
  "text-effects",
  "captions",
]);

interface BlocksTabProps {
  onAddBlock?: (blockName: string) => void | Promise<void>;
  onPreviewBlock?: (preview: BlockPreviewInfo | null) => void;
  variant?: CatalogVariant;
}

function LoadingGrid() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <b className="text-[13px] font-semibold text-[var(--st-t2)]">{t("elements.loading")}</b>
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="h-[46px] rounded-[12px] bg-[var(--st-sub)]" />
            <span className="h-2.5 w-1/2 rounded-full bg-[var(--st-sub)]" />
            <span className="h-3 w-3/4 rounded-full bg-[var(--st-sub)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// fallow-ignore-next-line complexity
export const BlocksTab = memo(function BlocksTab({
  onAddBlock,
  onPreviewBlock,
  variant = "elements",
}: BlocksTabProps) {
  useLocale();
  const isPhone = useIsPhone();
  const { loading, error, search, setSearch, category, setCategory, filteredBlocks, retry } =
    useBlockCatalog();
  const allowed = CATALOG_CATEGORIES[variant];
  const allowedSet = useMemo(() => (allowed ? new Set(allowed) : null), [allowed]);
  const categories = useMemo(
    () => BLOCK_CATEGORIES.filter((c) => !allowedSet || allowedSet.has(c.id)),
    [allowedSet],
  );

  // A category picked in another catalog entry may not exist in this one.
  useEffect(() => {
    if (category && allowed && !allowed.includes(category)) setCategory(null);
  }, [allowed, category, setCategory]);

  const visible = allowedSet
    ? filteredBlocks.filter((b) => allowedSet.has(b.category))
    : filteredBlocks;
  const showVfxNote = category === "vfx";

  const body = (() => {
    if (loading) return <LoadingGrid />;
    if (error) {
      return (
        <PanelMessage
          role="alert"
          illustration={illustrationSrc("studio-preview-error")}
          title={t("elements.error")}
          action={
            <PanelPill size={34} icon="retry" onClick={retry}>
              {t("common.retry")}
            </PanelPill>
          }
        />
      );
    }
    if (visible.length === 0) {
      return (
        <PanelMessage
          title={t("elements.noMatch")}
          action={
            search ? (
              <PanelPill size={34} onClick={() => setSearch("")}>
                {t("media.clearSearch")}
              </PanelPill>
            ) : undefined
          }
        />
      );
    }
    return (
      <>
        {showVfxNote ? (
          <div
            role="note"
            className="rounded-md px-3 py-2.5 text-xs font-medium text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)]"
          >
            {t("elements.vfxNote")}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5">
          {visible.map((block) => (
            <BlockCard
              key={block.name}
              name={block.name}
              title={block.title}
              description={block.description}
              blockType={block.type}
              duration={"duration" in block ? (block.duration as number) : undefined}
              category={block.category}
              tags={block.tags}
              posterUrl={block.preview?.poster}
              videoUrl={block.preview?.video}
              onPreview={onPreviewBlock}
              onAdd={
                (isPhone || ADDABLE.has(block.category)) && onAddBlock
                  ? () => onAddBlock(block.name)
                  : undefined
              }
            />
          ))}
        </div>
      </>
    );
  })();

  return (
    <PanelCard title={t(TITLE_KEY[variant])}>
      <PanelSearch value={search} onChange={setSearch} label={t("elements.search")} />
      {categories.length > 1 ? (
        <PanelChipGroup label={t("elements.categories")}>
          <PanelChip pressed={category === null} onClick={() => setCategory(null)}>
            {t("elements.all")}
          </PanelChip>
          {categories.map((cat) => (
            <PanelChip
              key={cat.id}
              pressed={category === cat.id}
              onClick={() => setCategory(category === cat.id ? null : cat.id)}
            >
              {categoryLabel(cat.id)}
            </PanelChip>
          ))}
        </PanelChipGroup>
      ) : null}
      <PanelBody>{body}</PanelBody>
    </PanelCard>
  );
});
