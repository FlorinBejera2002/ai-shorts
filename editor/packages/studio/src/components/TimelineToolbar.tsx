// Timeline toolbar (St-Timeline-Tools, St-M-Timeline-Tools): tools, snap, keyframe, auto-record,
// split, beat, thumbnails, shortcuts, then zoom and "Potrivește". The phone row keeps the edit
// tools and replaces the zoom controls with the zoom readout pill.
import { useEffect } from "react";
import { useKeyframeKeyboard } from "../hooks/useKeyframeKeyboard";
import {
  getNextTimelineZoomPercent,
  getTimelineZoomPercent,
  timelineZoomPercentToSlider,
  timelineSliderToZoomPercent,
} from "../player/components/timelineZoom";
import { useTimelineZoom } from "../player/components/useTimelineZoom";
import { usePlayerStore, type TimelineElement } from "../player";
import { useCaptionStore } from "../captions/store";
import { t, useLocale } from "../i18n/translate";
import { canSplitElement } from "../utils/timelineElementSplit";
import { canAddBeatAt, addBeatAtCompositionTime } from "../utils/beatEditActions";
import { useIsPhone } from "./shell/useIsPhone";
import {
  RecordButton,
  ToolButton,
  ToolPill,
  ToolSeparator,
  ZoomSlider,
} from "./nle/TimelineToolbarControls";
import {
  keyframeLabelKey,
  keyframeTipKey,
  useKeyframeToggle,
  type DomEditSessionSlice,
} from "./nle/TimelineToolbarKeyframe";
import { useTimelineShortcutsControl } from "./nle/TimelineToolbarShortcutsContext";

interface TimelineToolbarProps {
  domEditSession?: DomEditSessionSlice;
  onSplitElement?: (element: TimelineElement, splitTime: number) => void;
}

/** "N" toggles timeline snapping (Resolve/FCP convention). Skipped while typing. */
function useSnapHotkey() {
  useEffect(() => {
    // fallow-ignore-next-line complexity
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName?.toLowerCase() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const store = usePlayerStore.getState();
      store.setTimelineSnapEnabled(!store.timelineSnapEnabled);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Split is offered for the selected clip only while the playhead sits strictly inside it. */
function useSplitState() {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const selectedElementId = usePlayerStore((s) => s.selectedElementId);
  const elements = usePlayerStore((s) => s.elements);
  const element = selectedElementId
    ? elements.find((e) => (e.key ?? e.id) === selectedElementId)
    : undefined;
  const splittable = element != null && canSplitElement(element);
  const canSplit =
    splittable &&
    element != null &&
    currentTime > element.start &&
    currentTime < element.start + element.duration;
  const tip = canSplit
    ? t("timeline.splitTip")
    : splittable
      ? t("timeline.splitMoveTip")
      : t("timeline.splitSelectTip");
  return { element, canSplit, tip, currentTime };
}

function useBeatState() {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const beatAnalysisReady = usePlayerStore((s) => s.beatAnalysis !== null);
  const canAdd = beatAnalysisReady && canAddBeatAt(currentTime);
  const tip = !beatAnalysisReady
    ? t("timeline.beatNoMusicTip")
    : canAdd
      ? t("timeline.beatTip")
      : t("timeline.beatExistsTip");
  return { canAdd, tip, add: () => canAdd && addBeatAtCompositionTime(currentTime) };
}

function useZoomControls() {
  const timelineFitPps = usePlayerStore((s) => s.timelineFitPps);
  const { zoomMode, manualZoomPercent, setZoomMode, setManualZoomPercent } = useTimelineZoom();
  const percent = getTimelineZoomPercent(zoomMode, manualZoomPercent, timelineFitPps);
  const step = (direction: "in" | "out") => {
    setZoomMode("manual");
    setManualZoomPercent(
      getNextTimelineZoomPercent(direction, zoomMode, manualZoomPercent, timelineFitPps),
    );
  };
  return {
    zoomMode,
    readout: zoomMode === "fit" ? t("timeline.fitLabel") : `${percent}%`,
    title: `${percent}%`,
    slider: timelineZoomPercentToSlider(percent, timelineFitPps),
    setSlider: (value: number) => {
      setZoomMode("manual");
      setManualZoomPercent(timelineSliderToZoomPercent(value, timelineFitPps));
    },
    zoomIn: () => step("in"),
    zoomOut: () => step("out"),
    fit: () => setZoomMode("fit"),
  };
}

// fallow-ignore-next-line complexity
export function TimelineToolbar({ domEditSession, onSplitElement }: TimelineToolbarProps) {
  useLocale();
  const phone = useIsPhone();
  const activeTool = usePlayerStore((s) => s.activeTool);
  const setActiveTool = usePlayerStore((s) => s.setActiveTool);
  const snap = usePlayerStore((s) => s.timelineSnapEnabled);
  const setSnap = usePlayerStore((s) => s.setTimelineSnapEnabled);
  const autoKey = usePlayerStore((s) => s.autoKeyframeEnabled);
  const setAutoKey = usePlayerStore((s) => s.setAutoKeyframeEnabled);
  const thumbnailMode = usePlayerStore((s) => s.thumbnailMode);
  const setThumbnailMode = usePlayerStore((s) => s.setThumbnailMode);
  const captionEditMode = useCaptionStore((s) => s.isEditMode);
  const thumbs = thumbnailMode === "adaptive";
  const shortcuts = useTimelineShortcutsControl();
  const keyframe = useKeyframeToggle(domEditSession);
  const split = useSplitState();
  const beat = useBeatState();
  const zoom = useZoomControls();
  const size = phone ? 34 : 32;

  // Wire the "Add keyframe (K)" shortcut the toolbar advertises. Active only with a
  // keyframeable selection; otherwise K stays JKL-pause in playback.
  useKeyframeKeyboard({ enabled: Boolean(keyframe.onToggle), onAddKeyframe: keyframe.onToggle });
  useSnapHotkey();

  const thumbsLabel = thumbs ? t("timeline.thumbsHide") : t("timeline.thumbsShow");
  const tools = (
    <>
      <ToolButton
        icon="cursor"
        label={t("timeline.select")}
        tip={t("timeline.selectTip")}
        pressed={activeTool === "select"}
        toggle
        size={size}
        onClick={() => setActiveTool("select")}
      />
      <ToolButton
        icon="scissors"
        label={t("timeline.razor")}
        tip={phone ? t("timeline.razorShortTip") : t("timeline.razorTip")}
        pressed={activeTool === "razor"}
        toggle
        size={size}
        onClick={() => setActiveTool("razor")}
      />
    </>
  );
  const snapButton = (
    <ToolButton
      icon="magnet"
      label={t("timeline.snap")}
      tip={snap ? t("timeline.snapOnTip") : t("timeline.snapOffTip")}
      pressed={snap}
      toggle
      size={size}
      onClick={() => setSnap(!snap)}
    />
  );
  const keyButton = (
    <ToolButton
      icon="key"
      label={t(keyframeLabelKey(keyframe))}
      tip={t(keyframeTipKey(keyframe, Boolean(keyframe.onToggle)))}
      pressed={keyframe.state === "active"}
      disabled={!keyframe.onToggle}
      size={size}
      onClick={keyframe.onToggle}
    />
  );
  const splitButton = onSplitElement ? (
    <ToolButton
      icon="split"
      label={t("timeline.split")}
      tip={split.tip}
      disabled={!split.canSplit}
      size={size}
      onClick={() => {
        if (split.canSplit && split.element) onSplitElement(split.element, split.currentTime);
      }}
    />
  ) : null;
  const beatButton = (
    <ToolButton
      icon="beat"
      label={t("timeline.beat")}
      tip={beat.tip}
      disabled={!beat.canAdd}
      size={size}
      onClick={beat.add}
    />
  );
  const thumbsButton = (
    <ToolButton
      icon="media"
      label={thumbsLabel}
      tip={thumbsLabel}
      pressed={thumbs}
      toggle
      size={size}
      onClick={() => setThumbnailMode(thumbs ? "hidden" : "adaptive")}
    />
  );

  if (phone) {
    return (
      <div
        role="toolbar"
        aria-label={t("timeline.toolbar")}
        data-timeline-toolbar="phone"
        className="flex h-[34px] min-w-0 items-center gap-1"
      >
        {tools}
        {keyButton}
        {splitButton}
        {beatButton}
        {snapButton}
        {thumbsButton}
        <span className="flex-1" />
        <ToolPill label={t("timeline.zoomLevel")} tip={t("timeline.fitTip")} onClick={zoom.fit}>
          {zoom.readout}
        </ToolPill>
      </div>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label={t("timeline.toolbar")}
      data-timeline-toolbar="desktop"
      className="flex h-9 min-w-0 items-center gap-1"
    >
      {tools}
      <ToolSeparator />
      {snapButton}
      {keyButton}
      <RecordButton
        on={autoKey}
        label={t("timeline.autoKey")}
        tip={autoKey ? t("timeline.autoKeyOnTip") : t("timeline.autoKeyOffTip")}
        onToggle={() => setAutoKey(!autoKey)}
      />
      <ToolSeparator />
      {splitButton}
      {beatButton}
      <ToolSeparator />
      {thumbsButton}
      {shortcuts && (
        <ToolButton
          icon="keyboard"
          label={t("timeline.shortcuts")}
          pressed={shortcuts.open}
          toggle
          onClick={shortcuts.toggle}
        />
      )}
      <span className="min-w-2 flex-1" />
      {captionEditMode && (
        <span className="inline-flex h-[30px] flex-none items-center whitespace-nowrap rounded-full bg-[var(--st-sel)] px-3 text-xs font-semibold text-[var(--st-on-sel)]">
          {t("timeline.editingCaptions")}
        </span>
      )}
      <ToolButton icon="zoomOut" label={t("timeline.zoomOut")} onClick={zoom.zoomOut} />
      <ZoomSlider
        value={zoom.slider}
        label={t("timeline.zoom")}
        title={zoom.title}
        onChange={zoom.setSlider}
      />
      <ToolButton icon="zoomIn" label={t("timeline.zoomIn")} onClick={zoom.zoomIn} />
      <span
        aria-label={t("timeline.zoomLevel")}
        className="min-w-12 select-none text-center text-xs font-semibold tabular-nums text-[var(--st-tx)]"
      >
        {zoom.readout}
      </span>
      <ToolPill tip={t("timeline.fitTip")} pressed={zoom.zoomMode === "fit"} onClick={zoom.fit}>
        {t("timeline.fit")}
      </ToolPill>
    </div>
  );
}
