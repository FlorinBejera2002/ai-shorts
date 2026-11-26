// Inspector card chrome (St-Inspector-Tabs, St-Inspector-Avansat, St-M-ClipSheet): the title
// row with its close action, and the Design / Straturi / Randări (N) / Avansat segment. The
// Avansat tab opens a menu of developer tools (Diapozitive, Variabile, Parametri bloc).
import { useCallback, useMemo, useRef, useState } from "react";
import { MenuList, type MenuItem } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { useDismissOnOutside } from "../shell/useDismissOnOutside";

export function InspectorHeader({
  title,
  phone,
  onClose,
  slotRef,
}: {
  title: string;
  phone: boolean;
  onClose: () => void;
  /** Receives the node that hosts the selection's actions (see headerSlot.tsx). */
  slotRef?: (node: HTMLDivElement | null) => void;
}) {
  useLocale();
  return (
    <div className="flex min-h-9 items-center gap-2">
      <h2
        className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold leading-6 text-studio-text"
        title={title}
      >
        {title}
      </h2>
      <div ref={slotRef} className="flex flex-none items-center gap-0.5 empty:hidden" />
      {phone ? (
        <button
          type="button"
          onClick={onClose}
          className="h-11 flex-none rounded-full bg-studio-accent px-5 text-[13px] font-semibold text-studio-on-accent active:scale-[0.98]"
        >
          {t("inspector.done")}
        </button>
      ) : (
        <button
          type="button"
          aria-label={t("inspector.close")}
          title={t("inspector.close")}
          onClick={onClose}
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-studio-text hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

export type InspectorTabId = "design" | "layers" | "renders" | "advanced";

export interface InspectorTab {
  id: InspectorTabId;
  label: string;
  tooltip: string;
  active: boolean;
  onSelect: () => void;
}

function TabButton({ tab, onClick }: { tab: InspectorTab; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab.active}
      title={tab.tooltip}
      onClick={onClick}
      className={[
        "h-10 min-w-0 flex-auto truncate rounded-full px-2.5 text-[13px] transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-btn)]",
        tab.active
          ? "bg-studio-selected font-semibold text-studio-on-selected"
          : "font-medium text-studio-text hover:bg-[var(--st-sub)]",
      ].join(" ")}
    >
      {tab.label}
    </button>
  );
}

export function InspectorTabs({
  tabs,
  advancedItems,
}: {
  tabs: readonly InspectorTab[];
  /** Developer tools behind "Avansat". */
  advancedItems: readonly MenuItem[];
}) {
  useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dismissRefs = useMemo(() => [wrapRef], []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismissOnOutside(menuOpen, dismissRefs, closeMenu);
  return (
    <div ref={wrapRef} className="relative">
      <div
        role="tablist"
        aria-label={t("inspector.tabs")}
        className="flex min-w-0 gap-0.5 rounded-full bg-studio-surface p-1 shadow-[inset_0_0_0_1.5px_var(--st-bd)]"
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            onClick={() => {
              if (tab.id === "advanced") {
                setMenuOpen((open) => !open);
                return;
              }
              setMenuOpen(false);
              tab.onSelect();
            }}
          />
        ))}
      </div>
      {menuOpen && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-30 w-[236px]">
          <MenuList
            label={t("inspector.advancedMenu")}
            items={advancedItems}
            onDone={() => setMenuOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
