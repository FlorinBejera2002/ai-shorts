import { t } from "../../../i18n/translate";
import { Kbd } from "../../../components/nle/preview/previewChrome";
import { modifierKeyLabel } from "../../../utils/commandKey";
import type { ShortcutKey, ShortcutSection } from "./shortcutSections";

function keyText(key: ShortcutKey): string {
  return typeof key === "string" ? modifierKeyLabel(key) : t(key.word);
}

/** Section title row shared by the shortcuts and tools panels (13px semibold, 24px tall). */
export function PanelSectionTitle({ children }: { children: string }) {
  return (
    <div className="flex min-h-6 items-center">
      <b className="text-[13px] font-semibold text-studio-text">{children}</b>
    </div>
  );
}

/** One shortcut section: title, then rows of key caps (112px column) and the action. */
export function ShortcutSectionList({ section }: { section: ShortcutSection }) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5" data-shortcut-section={section.id}>
      <PanelSectionTitle>{t(section.title)}</PanelSectionTitle>
      <div className="flex flex-col gap-1">
        {section.hints.map((hint) => (
          <div key={hint.label} className="flex min-h-7 items-center gap-3">
            <span className="flex w-28 flex-none gap-1">
              {hint.keys.map((key) => (
                <Kbd key={keyText(key)}>{keyText(key)}</Kbd>
              ))}
            </span>
            <span className="min-w-0 text-[13px] font-medium text-studio-text">
              {t(hint.label)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
