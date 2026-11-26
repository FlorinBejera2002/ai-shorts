// Straturi panel (St-Layers): one group per timeline track with its clips under it. A clip row
// selects the clip and scrolls the timeline to it, the same as clicking it on the timeline.
// Hidden clips show the crossed eye.
import { memo, useMemo, useState } from "react";
import { illustrationSrc } from "../ui";
import { t, useLocale } from "../../i18n/translate";
import { usePlayerStore, type TimelineElement } from "../../player/store/playerStore";
import { timelineClipFocusId } from "../../player/components/timelineNavigationIdentity";
import { formatShortDuration } from "./assetHelpers";
import { PanelIcon } from "./panelIcons";
import { PanelBody, PanelCard, PanelMessage } from "./panelKit";
import type { MessageKey } from "../../i18n/dictionary";

type LayerKind = "video" | "audio" | "music" | "image" | "text" | "composition" | "other";

const KIND_LABEL: Record<LayerKind, MessageKey> = {
  video: "media.kindVideo",
  audio: "media.kindAudio",
  music: "media.kindAudio",
  image: "media.kindImage",
  text: "elements.text",
  composition: "advanced.comps",
  other: "media.kindAsset",
};

export function layerKind(el: TimelineElement): LayerKind {
  if (el.compositionSrc || el.kind === "composition") return "composition";
  const tag = el.tag.toLowerCase();
  if (tag === "video" || el.kind === "video") return "video";
  if (tag === "audio" || el.kind === "audio")
    return el.timelineRole === "music" ? "music" : "audio";
  if (tag === "img" || tag === "picture" || tag === "svg" || el.kind === "image") return "image";
  if (/^(h[1-6]|p|span)$/.test(tag)) return "text";
  return "other";
}

export interface LayerGroup {
  track: number;
  kind: LayerKind;
  elements: TimelineElement[];
}

/** Elements grouped by track, top track first, clips in time order. Pure. */
export function groupLayers(elements: TimelineElement[]): LayerGroup[] {
  const byTrack = new Map<number, TimelineElement[]>();
  for (const el of elements) {
    const list = byTrack.get(el.track) ?? [];
    list.push(el);
    byTrack.set(el.track, list);
  }
  return [...byTrack.entries()]
    .sort(([a], [b]) => a - b)
    .map(([track, list]) => {
      const sorted = [...list].sort((a, b) => a.start - b.start);
      return { track, kind: layerKind(sorted[0]), elements: sorted };
    });
}

function KindTag({ kind, selected }: { kind: LayerKind; selected?: boolean }) {
  const label = t(KIND_LABEL[kind]).slice(0, 2);
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 min-w-7 flex-none items-center justify-center rounded-[8px] px-1.5 text-[11px] font-bold ${
        selected
          ? "bg-studio-on-selected text-studio-selected"
          : "bg-[var(--st-sub)] text-[var(--st-t2)]"
      }`}
    >
      {label}
    </span>
  );
}

function countLabel(group: LayerGroup): string {
  const n = group.elements.length;
  if (group.kind === "video")
    return n === 1 ? t("panelLayers.cutOne") : t("panelLayers.cuts", { n });
  return n === 1 ? t("panelLayers.itemOne") : t("panelLayers.items", { n });
}

const ROW =
  "flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md py-1.5 pr-2.5 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]";

export const LayersPanel = memo(function LayersPanel() {
  useLocale();
  const elements = usePlayerStore((s) => s.elements);
  const selectedId = usePlayerStore((s) => s.selectedElementId);
  const setSelectedElementId = usePlayerStore((s) => s.setSelectedElementId);
  const requestTimelineFocus = usePlayerStore((s) => s.requestTimelineFocus);
  const groups = useMemo(() => groupLayers(elements), [elements]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (track: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(track)) next.delete(track);
      else next.add(track);
      return next;
    });

  return (
    <PanelCard title={t("panelLayers.title")}>
      <PanelBody>
        {groups.length === 0 ? (
          <PanelMessage
            illustration={illustrationSrc("studio-empty-project")}
            title={t("panelLayers.empty")}
          />
        ) : (
          <div role="tree" aria-label={t("panelLayers.title")} className="flex flex-col gap-1.5">
            {groups.map((group) => {
              const open = !collapsed.has(group.track);
              return (
                <div key={group.track} className="contents">
                  <button
                    type="button"
                    role="treeitem"
                    aria-expanded={open}
                    onClick={() => toggle(group.track)}
                    className={`${ROW} bg-studio-surface pl-2.5 text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]`}
                  >
                    <span className="flex w-3.5 flex-none">
                      <PanelIcon name={open ? "chevronDown" : "chevronRight"} size={14} />
                    </span>
                    <KindTag kind={group.kind} />
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <b className="truncate text-[13px] font-semibold">
                        {t(KIND_LABEL[group.kind])} ·{" "}
                        {t("panelLayers.track", { n: group.track + 1 })}
                      </b>
                      <span className="truncate text-xs text-[var(--st-t2)]">
                        {countLabel(group)}
                      </span>
                    </span>
                  </button>
                  {open
                    ? group.elements.map((el) => {
                        const key = el.key ?? el.id;
                        const selected = selectedId === key || selectedId === el.id;
                        const name = el.label || el.domId || el.id;
                        return (
                          <button
                            key={key}
                            type="button"
                            role="treeitem"
                            aria-selected={selected}
                            aria-label={t("panelLayers.select", { name })}
                            onClick={() => {
                              setSelectedElementId(key);
                              requestTimelineFocus(timelineClipFocusId(key));
                            }}
                            className={`${ROW} pl-8 ${
                              selected
                                ? "bg-studio-selected text-studio-on-selected"
                                : "bg-studio-surface text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
                            }`}
                          >
                            <KindTag kind={layerKind(el)} selected={selected} />
                            <span className="flex min-w-0 flex-1 flex-col gap-px">
                              <b className="truncate text-[13px] font-semibold">{name}</b>
                              <span
                                className={`truncate text-xs tabular-nums ${selected ? "opacity-80" : "text-[var(--st-t2)]"}`}
                              >
                                {formatShortDuration(el.duration) || "0:00"}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={`flex ${el.hidden ? "" : "opacity-40"}`}
                            >
                              <PanelIcon name={el.hidden ? "eyeOff" : "eye"} />
                            </span>
                          </button>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </div>
        )}
      </PanelBody>
    </PanelCard>
  );
});
