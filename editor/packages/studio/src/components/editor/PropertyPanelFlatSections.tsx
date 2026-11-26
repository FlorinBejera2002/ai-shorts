// St-Inspector-Element: the element inspector's sections. "Secțiuni" lists them as a
// two-column grid of cards. Opening one shows its controls first, under a "‹ <section>" row
// (with the section's own accessory) that closes it; the other cards follow below.
import type { ReactNode, RefObject } from "react";
import { DesignPanelInputProvider } from "../../contexts/DesignPanelInputContext";
import { slugifyDesignInput } from "../../utils/designInputTracking";
import { t, useLocale } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import type { FlatGroupDescriptor } from "./propertyPanelFlatDescriptors";

const SECTION_META: Record<string, { label: MessageKey; icon: string }> = {
  text: { label: "flat.section.text", icon: "M5 6V5h14v1M12 5v14M9 19h6" },
  style: { label: "flat.section.style", icon: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" },
  layout: { label: "flat.section.layout", icon: "M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" },
  grade: { label: "flat.section.grade", icon: "M12 3a9 9 0 100 18zM12 3a9 9 0 010 18" },
  effects: {
    label: "flat.section.effects",
    icon: "M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  },
  overlays: {
    label: "flat.section.overlays",
    icon: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  },
  audioFx: { label: "flat.section.audioFx", icon: "M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 010 6" },
  "audio-fx": { label: "flat.section.audioFx", icon: "M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 010 6" },
  media: { label: "flat.section.media", icon: "M4 5h16v14H4zM4 15l5-5 5 5 2-2 4 4M15 9h.01" },
  motion: { label: "flat.section.motion", icon: "M4 18c4 0 4-12 8-12s4 12 8 12" },
  timing: { label: "flat.section.timing", icon: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" },
};

const FALLBACK_ICON = "M5 5h14v14H5z";

/** Motion is called Timing on audio (no tween editor), so the title picks the entry. */
function sectionMeta(group: FlatGroupDescriptor) {
  return group.title === "Timing" ? SECTION_META.timing : SECTION_META[group.id];
}

export function flatSectionLabel(group: FlatGroupDescriptor): string {
  const meta = sectionMeta(group);
  return meta ? t(meta.label) : group.title;
}

function SectionIcon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d={d} />
    </svg>
  );
}

const CHEVRON = "M9 6l6 6-6 6";

function SectionCard({
  group,
  entering,
  onOpen,
}: {
  group: FlatGroupDescriptor;
  entering: boolean;
  onOpen: () => void;
}) {
  const label = flatSectionLabel(group);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={group.summary ? `${label} · ${group.summary}` : label}
      aria-expanded={false}
      data-flat-section={group.id}
      data-flat-group-collapsed="true"
      className={`${entering ? "hf-flat-group-enter " : ""}flex h-11 min-w-0 items-center gap-2.5 rounded-md bg-studio-surface pr-2.5 pl-3 text-left text-[13px] font-medium text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-bd)] hover:bg-[var(--st-sub)] focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]`}
    >
      <SectionIcon d={sectionMeta(group)?.icon ?? FALLBACK_ICON} />
      <span data-flat-group-title="true" className="min-w-0 flex-1 truncate">
        {label}
      </span>
      <SectionIcon d={CHEVRON} />
    </button>
  );
}

export function PropertyPanelFlatSections({
  groups,
  openGroupId,
  justToggledIds,
  toggleOpen,
  bodyRef,
  footer,
  pinFooter = false,
}: {
  groups: readonly FlatGroupDescriptor[];
  openGroupId: string | null;
  justToggledIds: readonly string[];
  toggleOpen: (id: string) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
  footer: ReactNode;
  /** Keep the footer pinned under the scroll area (while recording, so Stop stays visible).
   *  Otherwise it scrolls with the content, so an open section gets the full card height. */
  pinFooter?: boolean;
}) {
  useLocale();
  const openGroup = groups.find((group) => group.id === openGroupId) ?? null;
  // The other sections stay one click away under the open one.
  const otherGroups = groups.filter((group) => group !== openGroup);
  const justToggledIdSet = new Set(justToggledIds);
  return (
    <>
      <div
        ref={bodyRef}
        data-flat-panel-body="true"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-2"
      >
        {openGroup && (
          <DesignPanelInputProvider section={slugifyDesignInput(openGroup.title)}>
            <div data-flat-group-open="true" className="flex flex-none flex-col gap-3">
              <div className="flex min-h-8 items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded
                  title={t("flat.collapse")}
                  onClick={() => toggleOpen(openGroup.id)}
                  className="-ml-2 inline-flex h-8 min-w-0 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-studio-text hover:bg-[var(--st-sub)]"
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
                    strokeLinejoin="round"
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                  <span data-flat-group-title="true" className="truncate">
                    {flatSectionLabel(openGroup)}
                  </span>
                </button>
                {openGroup.accessory}
              </div>
              <div
                className={`${justToggledIdSet.has(openGroup.id) ? "hf-flat-group-enter " : ""}overflow-y-auto`}
              >
                {openGroup.content}
              </div>
            </div>
          </DesignPanelInputProvider>
        )}
        {otherGroups.length > 0 && (
          <section aria-label={t("flat.sections")} className="flex flex-none flex-col gap-2.5">
            <h3 className="text-[13px] font-semibold text-studio-text">{t("flat.sections")}</h3>
            <div className="grid grid-cols-2 gap-2">
              {otherGroups.map((group) => (
                <DesignPanelInputProvider key={group.id} section={slugifyDesignInput(group.title)}>
                  <SectionCard
                    group={group}
                    entering={justToggledIdSet.has(group.id)}
                    onOpen={() => toggleOpen(group.id)}
                  />
                </DesignPanelInputProvider>
              ))}
            </div>
          </section>
        )}
        {!pinFooter && <div className="-mx-4 mt-auto flex-none">{footer}</div>}
      </div>
      {pinFooter && footer}
    </>
  );
}
