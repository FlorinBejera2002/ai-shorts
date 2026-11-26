import type { FrameStatus } from "@hyperframes/core/storyboard";
import type { MessageKey } from "../../i18n/dictionary";
import { t } from "../../i18n/translate";

/**
 * Single source of truth for how each frame lifecycle status is presented — label, tooltip and
 * the chip/dot classes — so the tile chip, the legend and the review summary cannot drift apart.
 * Colours follow the boards: Schiță and Construit are neutral, Animat uses the ok status tone.
 */
export const FRAME_STATUS_META: Record<
  FrameStatus,
  { labelKey: MessageKey; tipKey: MessageKey; chipClass: string; dotClass: string }
> = {
  outline: {
    labelKey: "story.outline",
    tipKey: "story.outlineTip",
    chipClass: "bg-[var(--st-sub)] text-[var(--st-t2)]",
    dotClass: "bg-[var(--st-t3)]",
  },
  built: {
    labelKey: "story.built",
    tipKey: "story.builtTip",
    chipClass: "bg-[var(--st-sub)] text-studio-text",
    dotClass: "bg-studio-text",
  },
  animated: {
    labelKey: "story.animated",
    tipKey: "story.animatedTip",
    chipClass: "bg-[var(--st-ok-bg)] text-[var(--st-ok)]",
    dotClass: "bg-[var(--st-ok)]",
  },
};

export function frameStatusLabel(status: FrameStatus): string {
  return t(FRAME_STATUS_META[status].labelKey);
}

export function frameStatusTip(status: FrameStatus): string {
  return t(FRAME_STATUS_META[status].tipKey);
}

/** The lifecycle order an agent advances each frame through. */
export const FRAME_STATUS_ORDER: FrameStatus[] = ["outline", "built", "animated"];

/** Status chip (board `badge`, 22px, 8px radius). */
export const FRAME_CHIP_CLASS =
  "inline-flex h-[22px] flex-none items-center rounded-lg px-2 text-xs font-semibold whitespace-nowrap";
