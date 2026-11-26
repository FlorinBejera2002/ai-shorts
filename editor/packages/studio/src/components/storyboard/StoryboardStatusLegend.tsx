import { t, useLocale } from "../../i18n/translate";
import {
  FRAME_CHIP_CLASS,
  FRAME_STATUS_META,
  FRAME_STATUS_ORDER,
  frameStatusLabel,
  frameStatusTip,
} from "./frameStatus";

/**
 * "Stare": the frame lifecycle (Schiță → Construit → Animat) as the same chips the tiles use.
 * The explanation of each status is the chip's tooltip.
 */
export function StoryboardStatusLegend() {
  useLocale();
  return (
    <section className="flex flex-col gap-2.5">
      <b className="text-[13px] font-semibold">{t("story.status")}</b>
      <div className="flex flex-wrap gap-1.5">
        {FRAME_STATUS_ORDER.map((status) => (
          <span
            key={status}
            title={frameStatusTip(status)}
            className={`${FRAME_CHIP_CLASS} ${FRAME_STATUS_META[status].chipClass}`}
          >
            {frameStatusLabel(status)}
          </span>
        ))}
      </div>
    </section>
  );
}
