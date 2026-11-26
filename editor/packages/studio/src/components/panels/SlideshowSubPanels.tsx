/**
 * SlideshowSubPanels — internal sub-surface components for SlideshowPanel, drawn as the
 * St-Output-Slideshow* boards: slide rows with a switch and move buttons, the slide's notes
 * and hold points, and the hotspot form. Branches live in SlideshowBranches.tsx.
 */

import { useState, useCallback, useId } from "react";
import type { SlideRef, SlideHotspot, SlideSequence } from "@hyperframes/core/slideshow";
import type { DomEditSelection } from "../editor/domEditing";
import type { SceneInfo } from "./slideshowPanelHelpers";
import { generateId } from "../../utils/generateId";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton, OutputIconButton } from "../output/OutputButton";
import { OutputInput, OutputSection, OutputSelect } from "../output/OutputFields";
import { OutputIcon } from "../output/OutputIcon";

export { BranchTree, type BranchTreeProps } from "./SlideshowBranches";

const ROW = "rounded-[14px] bg-studio-surface shadow-[inset_0_0_0_1px_var(--st-bd)]";

function formatTime(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

// ── Section header (accordion toggle) ────────────────────────────────────

export function SectionHeader({
  children,
  expanded,
  onToggle,
}: {
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-9 w-full items-center justify-between gap-2 rounded-xl text-left font-display text-[15px] font-semibold text-studio-text outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <span>{children}</span>
      <OutputIcon name={expanded ? "chevronUp" : "chevronDown"} size={16} />
    </button>
  );
}

/** 40×24 switch drawn as the board's switchEl. */
export function SlideSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-6 w-10 flex-none rounded-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)] ${
        checked ? "bg-[var(--st-btn)]" : "bg-[var(--st-hd)]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full ${
          checked ? "left-[19px] bg-[var(--st-on-btn)]" : "left-[3px] bg-studio-surface"
        }`}
      />
    </button>
  );
}

// ── Sub-surface: Slide List ──────────────────────────────────────────────

export interface SlideListProps {
  scenes: SceneInfo[];
  slides: SlideRef[];
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onToggle: (sceneId: string) => void;
  onReorder: (sceneId: string, dir: "up" | "down") => void;
}

export function SlideList({
  scenes,
  slides,
  selectedSceneId,
  onSelect,
  onToggle,
  onReorder,
}: SlideListProps) {
  useLocale();
  const slideIds = new Set(slides.map((s) => s.sceneId));
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const orderedSlideScenes = slides
    .map((sl) => sceneById.get(sl.sceneId))
    .filter((s): s is SceneInfo => s !== undefined);
  const nonSlideScenes = scenes.filter((sc) => !slideIds.has(sc.id));
  const rows = [...orderedSlideScenes, ...nonSlideScenes];
  if (scenes.length === 0) {
    return <b className="py-4 text-center text-sm font-semibold">{t("slides.noScenes")}</b>;
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((scene, index) => {
        const isSlide = slideIds.has(scene.id);
        const isSelected = selectedSceneId === scene.id;
        const slideIndex = slides.findIndex((s) => s.sceneId === scene.id);
        const label = scene.label || scene.id;
        return (
          <div
            key={scene.id}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-[14px] bg-studio-surface p-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
              isSelected
                ? "shadow-[inset_0_0_0_2px_var(--st-tx)]"
                : "shadow-[inset_0_0_0_1px_var(--st-bd)] hover:bg-[var(--st-sub)]"
            }`}
            onClick={() => onSelect(scene.id)}
            onKeyDown={(e) => {
              // Keys pressed on the nested switch or move buttons belong to those controls.
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(scene.id);
              }
            }}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-[13px] font-semibold">
                {index + 1}. {label}
              </b>
              <span className="text-[11px] text-[var(--st-t2)]">
                {isSlide ? t("slides.inShow") : t("slides.hidden")}
              </span>
            </span>
            <SlideSwitch
              checked={isSlide}
              label={t("slides.include", { label })}
              onChange={() => onToggle(scene.id)}
            />
            {isSlide && (
              <>
                <OutputIconButton
                  icon="chevronUp"
                  label={t("slides.moveUp", { label })}
                  size={28}
                  iconSize={14}
                  disabled={slideIndex <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(scene.id, "up");
                  }}
                />
                <OutputIconButton
                  icon="chevronDown"
                  label={t("slides.moveDown", { label })}
                  size={28}
                  iconSize={14}
                  disabled={slideIndex === slides.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReorder(scene.id, "down");
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-surface: Slide Inspector ─────────────────────────────────────────

export interface SlideInspectorProps {
  sceneId: string;
  slide: SlideRef | undefined;
  currentTime: number;
  onSetNotes: (notes: string) => void;
  onMarkFragment: () => void;
  onRemoveFragment: (time: number) => void;
}

export function SlideInspector({
  sceneId,
  slide,
  currentTime,
  onSetNotes,
  onMarkFragment,
  onRemoveFragment,
}: SlideInspectorProps) {
  useLocale();
  const notesId = useId();
  const fragments = slide?.fragments ?? [];
  return (
    <div className="flex flex-col gap-5" data-slide-scene={sceneId}>
      <OutputSection title={t("slides.notes")} labelFor={notesId}>
        <textarea
          id={notesId}
          rows={4}
          placeholder={t("slides.notesPlaceholder")}
          value={slide?.notes ?? ""}
          onChange={(e) => onSetNotes(e.target.value)}
          className="block h-24 w-full resize-none rounded-[14px] border-0 bg-studio-surface px-3 py-2.5 text-[13px] leading-[18px] text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] outline-none placeholder:text-[var(--st-t3)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-btn)]"
        />
      </OutputSection>
      <OutputSection title={t("slides.holdPoints")}>
        {fragments.length > 0 ? (
          fragments.map((time) => (
            <div key={time} className={`flex items-center gap-2.5 p-2.5 ${ROW}`}>
              <b className="min-w-0 flex-1 text-[13px] font-semibold tabular-nums">
                {formatTime(time)}
              </b>
              <OutputIconButton
                icon="close"
                label={t("slides.removeHold", { time: formatTime(time) })}
                size={28}
                iconSize={14}
                onClick={() => onRemoveFragment(time)}
              />
            </div>
          ))
        ) : (
          <span className="text-[13px] font-medium text-[var(--st-t2)]">
            {t("slides.noHoldPoints")}
          </span>
        )}
      </OutputSection>
      <OutputButton className="w-full" onClick={onMarkFragment}>
        {t("slides.markHold", { time: formatTime(currentTime) })}
      </OutputButton>
    </div>
  );
}

// ── Sub-surface: Hotspot Tool ─────────────────────────────────────────────

export interface HotspotToolProps {
  selectedSceneId: string | null;
  slide: SlideRef | undefined;
  domEditSelection: DomEditSelection | null;
  sequences: SlideSequence[];
  onAddHotspot: (sceneId: string, hotspot: SlideHotspot) => void;
  onRemoveHotspot: (sceneId: string, hotspotId: string) => void;
}

function hotspotBlocker(elementKey: string | null, hasBranches: boolean, target: string) {
  if (!elementKey) return t("slides.noElement");
  if (!hasBranches) return t("slides.needBranch");
  if (!target) return t("slides.chooseBranchFirst");
  return null;
}

// fallow-ignore-next-line complexity
export function HotspotTool({
  selectedSceneId,
  slide,
  domEditSelection,
  sequences,
  onAddHotspot,
  onRemoveHotspot,
}: HotspotToolProps) {
  useLocale();
  const uid = useId();
  const [targetSequenceId, setTargetSequenceId] = useState("");
  const [hotspotLabel, setHotspotLabel] = useState("");
  const hotspots = slide?.hotspots ?? [];

  const selectedElementId = domEditSelection?.element?.id ?? null;
  const selectedHfId = domEditSelection?.hfId ?? null;
  const elementKey = selectedElementId || selectedHfId;

  // fallow-ignore-next-line complexity
  const handleMakeHotspot = useCallback(() => {
    if (!selectedSceneId || !targetSequenceId || !elementKey) return;
    const id = `hotspot-${elementKey}-${generateId()}`;
    const label = hotspotLabel.trim() || elementKey;
    onAddHotspot(selectedSceneId, { id, label, target: targetSequenceId });
    setHotspotLabel("");
  }, [selectedSceneId, targetSequenceId, elementKey, hotspotLabel, onAddHotspot]);

  if (!selectedSceneId) {
    return (
      <span className="text-[13px] font-medium text-[var(--st-t2)]">{t("slides.selectScene")}</span>
    );
  }

  const blocker = hotspotBlocker(elementKey, sequences.length > 0, targetSequenceId);
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`flex items-center gap-2 px-3 py-2.5 ${ROW}`}>
        <span className="text-xs font-semibold text-[var(--st-t2)]">
          {t("slides.selectedElement")}
        </span>
        <span className="min-w-0 flex-1 truncate text-right font-mono text-xs">
          {elementKey ?? "—"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-label`} className="text-xs font-semibold text-[var(--st-t2)]">
          {t("slides.hotspotLabel")}
        </label>
        <OutputInput
          id={`${uid}-label`}
          type="text"
          placeholder={t("slides.hotspotLabelPlaceholder")}
          value={hotspotLabel}
          onChange={(e) => setHotspotLabel(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-target`} className="text-xs font-semibold text-[var(--st-t2)]">
          {t("slides.targetBranch")}
        </label>
        <OutputSelect
          id={`${uid}-target`}
          value={targetSequenceId}
          onChange={(e) => setTargetSequenceId(e.target.value)}
        >
          <option value="">{t("slides.chooseBranch")}</option>
          {sequences.map((seq) => (
            <option key={seq.id} value={seq.id}>
              {seq.label}
            </option>
          ))}
        </OutputSelect>
      </div>
      {blocker ? <span className="text-xs font-medium text-[var(--st-t2)]">{blocker}</span> : null}
      {hotspots.length > 0 && (
        <OutputSection title={t("slides.hotspotsOnSlide")}>
          {hotspots.map((h) => {
            const seqLabel = sequences.find((s) => s.id === h.target)?.label ?? h.target;
            return (
              <div key={h.id} className={`flex items-center gap-2.5 p-2.5 ${ROW}`}>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  „{h.label}” → {seqLabel}
                </span>
                <OutputIconButton
                  icon="close"
                  label={t("slides.removeHotspot", { label: h.label })}
                  size={28}
                  iconSize={14}
                  onClick={() => onRemoveHotspot(selectedSceneId, h.id)}
                />
              </div>
            );
          })}
        </OutputSection>
      )}
      <OutputButton
        variant={blocker ? "secondary" : "primary"}
        className="w-full"
        disabled={blocker !== null}
        title={blocker ?? undefined}
        onClick={handleMakeHotspot}
      >
        {t("slides.makeHotspot")}
      </OutputButton>
    </div>
  );
}
