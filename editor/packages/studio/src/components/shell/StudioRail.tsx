// Desktop icon rail: a 72px labelled card (St-Main) or a 40px icon column when the side panel
// is collapsed (St-Shell-Collapsed). Also the 40px inspector rail of a narrow window.
import { t, useLocale } from "../../i18n/translate";
import { RAIL_ITEMS, type RailItemId } from "./railItems";
import { ShellIcon } from "./ShellIcon";

const CARD = "flex h-full min-h-0 flex-none flex-col rounded-card bg-studio-surface shadow-studio";
const ROUND_BUTTON =
  "flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors";

export interface StudioRailProps {
  active: RailItemId;
  collapsed: boolean;
  onSelect: (id: RailItemId) => void;
  onExpand: () => void;
}

export function StudioRail({ active, collapsed, onSelect, onExpand }: StudioRailProps) {
  useLocale();
  if (collapsed) {
    return (
      <nav aria-label={t("shell.railLabel")} className={`${CARD} w-10 items-center gap-1.5 py-2`}>
        <button
          type="button"
          aria-label={t("shell.showSidebar")}
          title={t("shell.showSidebar")}
          onClick={onExpand}
          className={`${ROUND_BUTTON} text-studio-text hover:bg-[var(--st-sub)]`}
        >
          <ShellIcon name="sidebar" size={16} />
        </button>
        {RAIL_ITEMS.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={t(item.label)}
              title={t(item.label)}
              aria-pressed={selected}
              onClick={() => onSelect(item.id)}
              className={`${ROUND_BUTTON} ${selected ? "bg-studio-selected text-studio-on-selected" : "text-[var(--st-t2)] hover:bg-[var(--st-sub)]"}`}
            >
              <ShellIcon name={item.icon} size={16} />
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label={t("shell.railLabel")} className={`${CARD} w-[72px] gap-1 px-1.5 py-2.5`}>
      {RAIL_ITEMS.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(item.id)}
            className={`flex h-[58px] flex-none flex-col items-center justify-center gap-[5px] whitespace-nowrap rounded-md text-[10.5px] font-semibold transition-colors ${
              selected
                ? "bg-studio-selected text-studio-on-selected"
                : "text-[var(--st-t2)] hover:bg-[var(--st-sub)]"
            }`}
          >
            <ShellIcon name={item.icon} size={20} />
            <span>{t(item.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** 40px inspector rail shown when the window is too narrow for the inspector (St-Shell-Narrow). */
export function InspectorRail({ onShow }: { onShow: () => void }) {
  useLocale();
  return (
    <div className={`${CARD} ml-3 w-10 items-center py-2`}>
      <button
        type="button"
        aria-label={t("shell.showInspector")}
        title={t("shell.showInspector")}
        onClick={onShow}
        className={`${ROUND_BUTTON} text-studio-text hover:bg-[var(--st-sub)]`}
      >
        <ShellIcon name="inspector" size={16} />
      </button>
    </div>
  );
}
