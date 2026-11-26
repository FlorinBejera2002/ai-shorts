import { useState } from "react";
import type { RegistryItem } from "@hyperframes/core/registry";
import { useBlockCatalog } from "../../hooks/useBlockCatalog";
import { Film } from "../../icons/SystemIcons";
import { t, useLocale } from "../../i18n/translate";
import { LOOK_ICONS, LOOK_ROW, LookAlert, LookIcon } from "./propertyPanelColorLookUi";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import type { DomEditSelection } from "./domEditing";
import type { ElementTiming } from "./propertyPanelFlatTimingDerivation";

export const MEDIA_TREATMENT_OVERLAY_TAG = "media-treatment-overlay";

export function filterMediaTreatmentOverlays(items: readonly RegistryItem[]): RegistryItem[] {
  return items.filter(
    (item) =>
      item.type === "hyperframes:block" &&
      item.tags?.includes(MEDIA_TREATMENT_OVERLAY_TAG) === true,
  );
}

export function deriveMediaOverlayPlacement(
  element: Pick<DomEditSelection, "dataAttributes" | "sourceFile">,
  timing: Pick<ElementTiming, "start" | "duration">,
) {
  const authoredTrack = Number.parseInt(element.dataAttributes["track-index"] ?? "", 10);
  return {
    start: timing.start,
    ...(timing.duration > 0 ? { duration: timing.duration } : {}),
    ...(Number.isFinite(authoredTrack) ? { track: authoredTrack + 1 } : {}),
    compositionPath: element.sourceFile,
  };
}

function formatSeconds(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
}

// St-Inspector-Overlays: one bordered row per overlay (preview, name, length) with a small
// "Adaugă" pill; loading shows a row with a spinner, errors use the danger tone.
export function FlatOverlaysSection({
  onAddOverlay,
}: {
  onAddOverlay: (name: string) => Promise<void>;
}) {
  useLocale();
  const track = useTrackDesignInput();
  const { blocks, loading, error } = useBlockCatalog();
  const overlays = filterMediaTreatmentOverlays(blocks);
  const [adding, setAdding] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  if (loading) {
    return (
      <div
        role="status"
        className={`${LOOK_ROW} flex min-h-12 items-center gap-2.5 px-3.5 text-[13px] font-medium text-studio-text`}
      >
        <span className="animate-spin">
          <LookIcon d={LOOK_ICONS.refresh} />
        </span>
        {t("look.overlays.loading")}
      </div>
    );
  }
  if (error) {
    return <LookAlert>{error}</LookAlert>;
  }

  const busy = adding !== null;
  return (
    <div data-flat-overlays="true" className="flex flex-col gap-2">
      {overlays.map((overlay) => {
        const duration =
          "duration" in overlay && typeof overlay.duration === "number" ? overlay.duration : null;
        return (
          <div
            key={overlay.name}
            className={`${LOOK_ROW} flex min-h-[60px] items-center gap-3 py-2 pr-2.5 pl-2`}
            onPointerEnter={() => setPreviewing(overlay.name)}
            onPointerLeave={() => setPreviewing(null)}
          >
            <span className="relative flex h-11 w-16 flex-none items-center justify-center overflow-hidden rounded-sm">
              {previewing === overlay.name && overlay.preview?.video ? (
                <video
                  src={overlay.preview.video}
                  poster={overlay.preview.poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="block h-full w-full object-cover"
                />
              ) : overlay.preview?.poster ? (
                <img
                  data-flat-overlay-preview={overlay.name}
                  src={overlay.preview.poster}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  className="block h-full w-full object-cover"
                />
              ) : (
                <Film size={15} className="text-studio-muted" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col" title={overlay.description}>
              <span className="truncate text-[13px] font-semibold text-studio-text">
                {overlay.title}
              </span>
              {duration !== null && (
                <span className="text-[12px] text-studio-muted">{formatSeconds(duration)}</span>
              )}
            </span>
            <button
              type="button"
              data-flat-overlay={overlay.name}
              aria-label={t("look.overlays.addOne", { name: overlay.title })}
              disabled={busy}
              onFocus={() => setPreviewing(overlay.name)}
              onBlur={() => setPreviewing(null)}
              onClick={() => {
                track("button", `Add ${overlay.title}`);
                setAdding(overlay.name);
                void onAddOverlay(overlay.name).finally(() => setAdding(null));
              }}
              className="inline-flex h-9 flex-none items-center rounded-full px-3.5 text-[12px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)] disabled:cursor-wait disabled:opacity-50"
            >
              {adding === overlay.name ? t("look.overlays.adding") : t("look.overlays.add")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
