import { t, useLocale } from "../i18n/translate";

/**
 * Files dragged over the editor (St-Drop): a dashed 24px frame 12px inside the window over a
 * light scrim, with the "Plasează la cursor" pill (files land at the playhead).
 */
export function StudioGlobalDragOverlay() {
  useLocale();
  return (
    <div className="hf-backdrop-in pointer-events-none absolute inset-0 z-[90]">
      <div
        aria-hidden="true"
        className="absolute inset-3 rounded-card border-2 border-dashed border-[var(--st-sbd)] bg-[color-mix(in_srgb,var(--st-ov)_35%,transparent)]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          role="status"
          className="inline-flex h-9 items-center whitespace-nowrap rounded-full bg-studio-accent px-3.5 text-[13px] font-semibold text-studio-on-accent shadow-studio"
        >
          {t("preview.dropAtPlayhead")}
        </span>
      </div>
    </div>
  );
}
