// Grade sub-views. The grade opens on St-Grade (colour, presets, LUT, finish); the rest of the
// grade lives one row away, each on its own board: light and colour (St-Inspector-GradeSliders),
// wheels, curves, secondary colour, LUT files, scopes, and original/copy (GradeActions).
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { LOOK_ICONS, LOOK_ROW, LookBack, LookIcon } from "./propertyPanelColorLookUi";

export type GradeView =
  | "main"
  | "light"
  | "wheels"
  | "curves"
  | "secondary"
  | "lut"
  | "scopes"
  | "actions";

const VIEW_TITLES: Record<Exclude<GradeView, "main">, MessageKey> = {
  light: "look.view.light",
  wheels: "look.wheels",
  curves: "look.curves",
  secondary: "look.secondary.title",
  lut: "look.view.lut",
  scopes: "look.scopes",
  actions: "look.view.actions",
};

export function gradeViewTitle(view: Exclude<GradeView, "main">): string {
  return t(VIEW_TITLES[view]);
}

/** The rows under St-Grade that open the other grade boards. */
export function GradeViewLinks({
  views,
  onOpen,
}: {
  views: readonly Exclude<GradeView, "main">[];
  onOpen: (view: Exclude<GradeView, "main">) => void;
}) {
  useLocale();
  return (
    <nav className="flex flex-col gap-2" data-flat-grade-links="true">
      {views.map((view) => (
        <button
          key={view}
          type="button"
          data-flat-grade-link={view}
          onClick={() => onOpen(view)}
          className={`flex min-h-12 items-center justify-between gap-2 px-3.5 text-left text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${LOOK_ROW}`}
        >
          <span className="truncate">{gradeViewTitle(view)}</span>
          <LookIcon d={LOOK_ICONS.chevronRight} />
        </button>
      ))}
    </nav>
  );
}

/** Back row at the top of a grade sub-view; the view's own blocks carry its title. */
export function GradeViewBack({ onBack }: { onBack: () => void }) {
  useLocale();
  return <LookBack label={t("look.section.grade")} onClick={onBack} />;
}
