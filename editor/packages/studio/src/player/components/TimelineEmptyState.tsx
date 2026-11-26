import type { DragEventHandler } from "react";
import { t, useLocale } from "../../i18n/translate";
import { illustrationSrc } from "../../components/ui";
import { RULER_H } from "./timelineLayout";

interface TimelineEmptyStateProps {
  isDragOver: boolean;
  onFileDrop?: boolean;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
}

/** Empty lanes (St-Timeline-EmptyDrop / -EmptyDrag): an illustration and one title in a dashed
 *  drop area under the ruler; a solid outline while files are dragged over it. */
export function TimelineEmptyState({
  isDragOver,
  onFileDrop,
  onDragOver,
  onDragLeave,
  onDrop,
}: TimelineEmptyStateProps) {
  useLocale();
  const title = isDragOver
    ? t("timeline.emptyDrag")
    : onFileDrop
      ? t("timeline.emptyTitle")
      : t("timeline.emptyTitleNoDrop");
  return (
    <div
      data-timeline-empty={isDragOver ? "drag" : "idle"}
      className="flex h-full min-h-0 select-none flex-col"
      style={{ paddingTop: RULER_H + 4 }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[20px] bg-[var(--st-sf)] outline-offset-[-2px] ${
          isDragOver
            ? "outline outline-2 outline-[var(--st-tx)]"
            : "outline-dashed outline-[1.5px] outline-[var(--st-t3)]"
        }`}
      >
        <img
          src={illustrationSrc(isDragOver ? "studio-drop" : "studio-empty-project")}
          alt=""
          aria-hidden="true"
          className="h-[72px] w-auto max-h-[40%] flex-none object-contain"
          draggable={false}
        />
        <b
          className="px-4 text-center text-sm font-semibold"
          style={{ color: isDragOver ? "var(--st-tx)" : "var(--st-t2)" }}
        >
          {title}
        </b>
      </div>
    </div>
  );
}
