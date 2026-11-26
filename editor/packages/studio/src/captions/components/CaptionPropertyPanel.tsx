import { memo, useCallback, useState } from "react";
import { useCaptionStore } from "../store";
import type { CaptionModel, CaptionStyle } from "../types";
import { CaptionAnimationPanel } from "./CaptionAnimationPanel";
import {
  applyTransformToWrappers,
  hasTransformUpdate,
  resolveSelectedWordElements,
} from "./captionIframeStyle";
import { Section, SliderField } from "./shared";
import {
  formatCaptionPercent,
  useCaptionBasePercent,
  type CaptionBasePercent,
} from "./captionPositionPercent";
import { applyTransformToAllGroups } from "./captionApplyAll";
import { t, useLocale } from "../../i18n/translate";
import { EmptyState } from "../../components/ui";
import { useInspectorTitle } from "../../components/inspector/headerSlot";

type PanelTab = "style" | "animation";

/** St-Captions names the inspector card after the selection ("3 cuvinte"). */
function CaptionCountTitle({ label }: { label: string }) {
  useInspectorTitle(label);
  return null;
}

function tabClass(active: boolean): string {
  return [
    "h-10 flex-1 rounded-full text-[13px] transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--st-btn)]",
    active
      ? "bg-studio-selected font-semibold text-studio-on-selected"
      : "font-medium text-studio-text hover:bg-[var(--st-sub)]",
  ].join(" ");
}

/** True when the given style key differs across the selected segments. */
function isMixedValue(
  model: { segments: Map<string, { style: Partial<CaptionStyle> }> } | null,
  selectedSegmentIds: Set<string>,
  key: "x" | "y" | "scaleX" | "rotation",
  fallback: number,
): boolean {
  if (!model || selectedSegmentIds.size < 2) return false;
  let first: number | undefined;
  let seen = false;
  for (const segId of selectedSegmentIds) {
    const v = model.segments.get(segId)?.style[key] ?? fallback;
    if (!seen) {
      first = v;
      seen = true;
    } else if (v !== first) {
      return true;
    }
  }
  return false;
}

/** The group that owns the first selected segment, in display order. */
function findOwnerGroupId(model: CaptionModel | null, firstSegmentId: string | undefined) {
  if (!model || !firstSegmentId) return null;
  for (const gid of model.groupOrder) {
    const group = model.groups.get(gid);
    if (group && group.segmentIds.includes(firstSegmentId)) return gid;
  }
  return null;
}

function CaptionTabSwitch({
  activeTab,
  onChange,
}: {
  activeTab: PanelTab;
  onChange: (tab: PanelTab) => void;
}) {
  return (
    <div className="flex-shrink-0 px-4 pb-[18px]">
      <div
        className="flex gap-0.5 rounded-full bg-studio-surface p-1 shadow-[inset_0_0_0_1.5px_var(--st-bd)]"
        role="tablist"
        aria-label={t("cap.tabs")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "style"}
          onClick={() => onChange("style")}
          className={tabClass(activeTab === "style")}
        >
          {t("cap.style")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "animation"}
          onClick={() => onChange("animation")}
          className={tabClass(activeTab === "animation")}
        >
          {t("cap.animation")}
        </button>
      </div>
    </div>
  );
}

interface CaptionTransformValues {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  xMixed: boolean;
  yMixed: boolean;
  scaleMixed: boolean;
  rotationMixed: boolean;
}

function CaptionTransformControls({
  values,
  bounds,
  base,
  onStyleChange,
  onApplyToAll,
}: {
  values: CaptionTransformValues;
  /** Where the first selected word sits without its offset, in percent of the frame. */
  base: CaptionBasePercent;
  /** Composition size: the X / Y sliders move a word across the whole frame. */
  bounds: { width: number; height: number };
  onStyleChange: (updates: Partial<CaptionStyle>) => void;
  onApplyToAll: () => void;
}) {
  const mixed = t("cap.mixed");
  const halfW = Math.round(bounds.width / 2);
  const halfH = Math.round(bounds.height / 2);
  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
      <Section label={t("cap.position")}>
        <SliderField
          label="X"
          value={values.x}
          min={-halfW}
          max={halfW}
          mixed={values.xMixed}
          mixedLabel={mixed}
          format={(v) => formatCaptionPercent(base.x, v, bounds.width)}
          onChange={(v) => onStyleChange({ x: v })}
        />
        <SliderField
          label="Y"
          value={values.y}
          min={-halfH}
          max={halfH}
          mixed={values.yMixed}
          mixedLabel={mixed}
          format={(v) => formatCaptionPercent(base.y, v, bounds.height)}
          onChange={(v) => onStyleChange({ y: v })}
        />
      </Section>

      <Section label={t("cap.transform")}>
        <SliderField
          label={t("cap.scale")}
          value={values.scaleX}
          min={0.1}
          max={3}
          step={0.05}
          mixed={values.scaleMixed}
          mixedLabel={mixed}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => onStyleChange({ scaleX: v, scaleY: v })}
        />
        <SliderField
          label={t("cap.rotation")}
          value={values.rotation}
          min={-180}
          max={180}
          mixed={values.rotationMixed}
          mixedLabel={mixed}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => onStyleChange({ rotation: v })}
        />
      </Section>
      <button
        type="button"
        onClick={onApplyToAll}
        className="mt-auto h-11 w-full flex-shrink-0 rounded-full text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] transition-colors hover:bg-[var(--st-sub)]"
      >
        {t("cap.applyAll")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CaptionPropertyPanelProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

export const CaptionPropertyPanel = memo(function CaptionPropertyPanel({
  iframeRef,
}: CaptionPropertyPanelProps) {
  useLocale();
  const model = useCaptionStore((s) => s.model);
  const selectedSegmentIds = useCaptionStore((s) => s.selectedSegmentIds);
  const selectedGroupId = useCaptionStore((s) => s.selectedGroupId);
  const updateSelectedStyle = useCaptionStore((s) => s.updateSelectedStyle);
  const updateGroupStyle = useCaptionStore((s) => s.updateGroupStyle);

  const [activeTab, setActiveTab] = useState<PanelTab>("style");

  // Resolve effective style for the first selected segment, merged over its group style
  const firstSegmentId = selectedSegmentIds.size > 0 ? [...selectedSegmentIds][0] : undefined;
  const firstSegment = model?.segments.get(firstSegmentId ?? "");
  const ownerGroupId = findOwnerGroupId(model, firstSegmentId);
  const groupStyle = ownerGroupId ? model?.groups.get(ownerGroupId)?.style : undefined;
  const effectiveStyle: Partial<CaptionStyle> = {
    ...groupStyle,
    ...(firstSegment?.style ?? {}),
  };
  const basePercent = useCaptionBasePercent(iframeRef, model, firstSegmentId, {
    x: effectiveStyle.x ?? 0,
    y: effectiveStyle.y ?? 0,
  });

  /**
   * Apply a CSS style change to selected word elements in the iframe DOM in real time.
   * Maps CaptionStyle property names to CSS properties.
   */
  const applyToIframeDom = useCallback(
    (updates: Partial<CaptionStyle>) => {
      const iframe = iframeRef.current;
      if (!iframe || !model) return;
      let doc: Document | null = null;
      try {
        doc = iframe.contentDocument;
      } catch {
        return;
      }
      if (!doc) return;

      const groupEls = doc.querySelectorAll<HTMLElement>(".caption-group");
      const targetEls = resolveSelectedWordElements(groupEls, model, selectedSegmentIds);
      if (hasTransformUpdate(updates)) {
        applyTransformToWrappers(iframe, doc, targetEls, updates);
      }
    },
    [iframeRef, model, selectedSegmentIds],
  );

  // All hooks must be called before any early return
  const handleStyleChange = useCallback(
    (updates: Partial<CaptionStyle>) => {
      if (selectedGroupId) {
        updateGroupStyle(selectedGroupId, updates);
      } else {
        updateSelectedStyle(updates);
      }
      applyToIframeDom(updates);
    },
    [selectedGroupId, updateGroupStyle, updateSelectedStyle, applyToIframeDom],
  );

  // Empty state — after all hooks
  // St-Inspector-CapEmpty: the tabs stay, the body shows the illustration and a title.
  if (selectedSegmentIds.size === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CaptionTabSwitch activeTab={activeTab} onChange={setActiveTab} />
        {activeTab === "animation" ? (
          <CaptionAnimationPanel />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState illustration="studio-nothing-selected" title={t("cap.emptyStyle")} />
          </div>
        )}
      </div>
    );
  }

  const countLabel =
    selectedSegmentIds.size === 1 ? t("cap.word") : t("cap.words", { n: selectedSegmentIds.size });

  const transformValues: CaptionTransformValues = {
    x: effectiveStyle.x ?? 0,
    y: effectiveStyle.y ?? 0,
    rotation: effectiveStyle.rotation ?? 0,
    scaleX: effectiveStyle.scaleX ?? 1,
    xMixed: isMixedValue(model, selectedSegmentIds, "x", 0),
    yMixed: isMixedValue(model, selectedSegmentIds, "y", 0),
    scaleMixed: isMixedValue(model, selectedSegmentIds, "scaleX", 1),
    rotationMixed: isMixedValue(model, selectedSegmentIds, "rotation", 0),
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <CaptionCountTitle label={countLabel} />
      {/* Tab switcher (St-Captions: Stil / Animație) */}
      <CaptionTabSwitch activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "animation" && <CaptionAnimationPanel />}

      {/* Style tab — Transform only */}
      {activeTab === "style" && (
        <CaptionTransformControls
          values={transformValues}
          bounds={{ width: model?.width ?? 1080, height: model?.height ?? 1920 }}
          base={basePercent}
          onApplyToAll={() =>
            applyTransformToAllGroups({
              x: transformValues.x,
              y: transformValues.y,
              scaleX: transformValues.scaleX,
              scaleY: effectiveStyle.scaleY ?? transformValues.scaleX,
              rotation: transformValues.rotation,
            })
          }
          onStyleChange={handleStyleChange}
        />
      )}
    </div>
  );
});
