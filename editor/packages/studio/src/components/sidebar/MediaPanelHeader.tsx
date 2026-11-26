import { t, useLocale } from "../../i18n/translate";
import type { MediaCategory } from "./assetHelpers";
import { PanelChip, PanelChipGroup, PanelSearch, PanelSegment } from "./panelKit";

export type MediaScope = "local" | "global";
export type MediaCategoryFilter = MediaCategory | "all";
export type UsageFilter = "all" | "used" | "unused";

export interface MediaPanelHeaderProps {
  scope: MediaScope;
  onScopeChange: (scope: MediaScope) => void;
  showFilters: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showSearch: boolean;
  activeCategory: MediaCategoryFilter;
  onCategoryChange: (category: MediaCategoryFilter) => void;
  categoryCounts: Record<string, number>;
  categoryOrder: readonly MediaCategory[];
  usage: { used: number; unused: number } | null;
  usageFilter: UsageFilter;
  onUsageFilterChange: (filter: UsageFilter) => void;
}

export const CATEGORY_KEYS: Record<
  MediaCategory,
  "media.filterAudio" | "media.filterImages" | "media.filterVideo" | "media.filterFonts"
> = {
  audio: "media.filterAudio",
  images: "media.filterImages",
  video: "media.filterVideo",
  fonts: "media.filterFonts",
};

/** Search, scope segment (Proiect / Toate), type chips and usage chips of the Media panel. */
export function MediaPanelHeader({
  scope,
  onScopeChange,
  showFilters,
  searchQuery,
  onSearchChange,
  showSearch,
  activeCategory,
  onCategoryChange,
  categoryCounts,
  categoryOrder,
  usage,
  usageFilter,
  onUsageFilterChange,
}: MediaPanelHeaderProps) {
  useLocale();
  const scopeOptions = [
    { value: "local" as const, label: t("media.scopeProject") },
    { value: "global" as const, label: t("media.scopeAll") },
  ];
  return (
    <div className="flex flex-none flex-col gap-2.5">
      {showSearch && (
        <PanelSearch value={searchQuery} onChange={onSearchChange} label={t("media.search")} />
      )}
      <PanelSegment
        label={t("media.scopeLabel")}
        options={scopeOptions}
        value={scope}
        onChange={onScopeChange}
      />
      {showFilters && (
        <PanelChipGroup label={t("media.typeLabel")} radio>
          <PanelChip
            role="radio"
            tone="soft"
            pressed={activeCategory === "all"}
            onClick={() => onCategoryChange("all")}
            count={categoryCounts.all ?? 0}
          >
            {t("media.filterAll")}
          </PanelChip>
          {categoryOrder.map((category) =>
            (categoryCounts[category] ?? 0) > 0 ? (
              <PanelChip
                key={category}
                role="radio"
                tone="soft"
                pressed={activeCategory === category}
                onClick={() => onCategoryChange(activeCategory === category ? "all" : category)}
                count={categoryCounts[category] ?? 0}
              >
                {t(CATEGORY_KEYS[category])}
              </PanelChip>
            ) : null,
          )}
        </PanelChipGroup>
      )}
      {showFilters && usage && usage.used > 0 && usage.unused > 0 && (
        <PanelChipGroup label={t("media.usageLabel")}>
          <PanelChip
            tone="soft"
            pressed={usageFilter === "used"}
            onClick={() => onUsageFilterChange(usageFilter === "used" ? "all" : "used")}
            count={usage.used}
          >
            {t("media.filterUsed")}
          </PanelChip>
          <PanelChip
            tone="soft"
            pressed={usageFilter === "unused"}
            onClick={() => onUsageFilterChange(usageFilter === "unused" ? "all" : "unused")}
            count={usage.unused}
          >
            {t("media.filterUnused")}
          </PanelChip>
        </PanelChipGroup>
      )}
    </div>
  );
}
