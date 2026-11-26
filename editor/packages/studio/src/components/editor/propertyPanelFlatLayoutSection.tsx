import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { FlatRow } from "./propertyPanelFlatPrimitives";
import { FlatField, FlatToggleSegment } from "./propertyPanelFlatTextControls";
import { InspectorSelect, InspectorSlider } from "./inspectorControls";
import { t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { KeyframeNavigation } from "./KeyframeNavigation";
import { formatPxMetricValue } from "./propertyPanelHelpers";
import { PropertyPanel3dTransform } from "./propertyPanel3dTransform";
import type { DomEditSelection } from "./domEditingTypes";

type KeyframeEntry = Array<{
  percentage: number;
  tweenPercentage?: number;
  properties: Record<string, number | string>;
  ease?: string;
}> | null;

interface GeometryRowsProps {
  element: DomEditSelection;
  displayX: number;
  displayY: number;
  displayW: number;
  displayH: number;
  displayR: number;
  manualOffsetEditingDisabled: boolean;
  manualSizeEditingDisabled: boolean;
  manualRotationEditingDisabled: boolean;
  commitManualOffset: (axis: "x" | "y", value: string) => void;
  commitManualSize: (dimension: "width" | "height", value: string) => void;
  commitManualRotation: (value: string) => void;
  gsapAnimId: string | null;
  navKeyframes: KeyframeEntry;
  currentPct: number;
  seekFromKfPct: (pct: number) => void;
  animIdForProp: (prop: string) => string;
  onCommitAnimatedProperty?: (
    element: DomEditSelection,
    property: string,
    value: number,
  ) => Promise<void>;
  onRemoveKeyframe?: (animId: string, pct: number) => void;
  onConvertToKeyframes?: (animId: string) => void;
}

function KeyframeGutter({
  element,
  property,
  displayValue,
  gsapAnimId,
  navKeyframes,
  currentPct,
  seekFromKfPct,
  animIdForProp,
  onCommitAnimatedProperty,
  onRemoveKeyframe,
  onConvertToKeyframes,
}: {
  property: string;
  displayValue: number;
} & Pick<
  GeometryRowsProps,
  | "element"
  | "gsapAnimId"
  | "navKeyframes"
  | "currentPct"
  | "seekFromKfPct"
  | "animIdForProp"
  | "onCommitAnimatedProperty"
  | "onRemoveKeyframe"
  | "onConvertToKeyframes"
>) {
  const track = useTrackDesignInput();
  if (!gsapAnimId) return null;
  const hasKeyframesOnProp = Boolean(navKeyframes?.some((kf) => property in kf.properties));
  return (
    <span data-flat-kf-gutter="true" style={{ opacity: hasKeyframesOnProp ? 1 : 0.3 }}>
      <KeyframeNavigation
        property={property}
        keyframes={navKeyframes}
        currentPercentage={currentPct}
        onSeek={seekFromKfPct}
        onAddKeyframe={() => {
          if (!onCommitAnimatedProperty) return;
          track("button", `Add ${property} keyframe`);
          void onCommitAnimatedProperty(element, property, displayValue);
        }}
        onRemoveKeyframe={(pct, animationId) => {
          if (!onRemoveKeyframe) return;
          track("button", `Remove ${property} keyframe`);
          onRemoveKeyframe(animationId ?? animIdForProp(property), pct);
        }}
        onConvertToKeyframes={() => {
          if (!onConvertToKeyframes) return;
          track("button", `Convert ${property} to keyframes`);
          onConvertToKeyframes(animIdForProp(property));
        }}
      />
    </span>
  );
}

export function LayoutGeometryRows({
  element,
  displayX,
  displayY,
  displayW,
  displayH,
  displayR,
  manualOffsetEditingDisabled,
  manualSizeEditingDisabled,
  manualRotationEditingDisabled,
  commitManualOffset,
  commitManualSize,
  commitManualRotation,
  gsapAnimId,
  navKeyframes,
  currentPct,
  seekFromKfPct,
  animIdForProp,
  onCommitAnimatedProperty,
  onRemoveKeyframe,
  onConvertToKeyframes,
}: GeometryRowsProps) {
  const gutterProps = {
    element,
    gsapAnimId,
    navKeyframes,
    currentPct,
    seekFromKfPct,
    animIdForProp,
    onCommitAnimatedProperty,
    onRemoveKeyframe,
    onConvertToKeyframes,
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <FlatRow
          stacked
          label="X"
          value={formatPxMetricValue(displayX)}
          tier={displayX === 0 ? "default" : "explicitCustom"}
          disabled={manualOffsetEditingDisabled}
          onCommit={(next) => commitManualOffset("x", next)}
          suffix={<KeyframeGutter property="x" displayValue={displayX} {...gutterProps} />}
        />
        <FlatRow
          stacked
          label="Y"
          value={formatPxMetricValue(displayY)}
          tier={displayY === 0 ? "default" : "explicitCustom"}
          disabled={manualOffsetEditingDisabled}
          onCommit={(next) => commitManualOffset("y", next)}
          suffix={<KeyframeGutter property="y" displayValue={displayY} {...gutterProps} />}
        />
        <FlatRow
          stacked
          label="W"
          value={formatPxMetricValue(displayW)}
          tier="default"
          disabled={manualSizeEditingDisabled}
          onCommit={(next) => commitManualSize("width", next)}
          suffix={<KeyframeGutter property="width" displayValue={displayW} {...gutterProps} />}
        />
        <FlatRow
          stacked
          label="H"
          value={formatPxMetricValue(displayH)}
          tier="default"
          disabled={manualSizeEditingDisabled}
          onCommit={(next) => commitManualSize("height", next)}
          suffix={<KeyframeGutter property="height" displayValue={displayH} {...gutterProps} />}
        />
      </div>
      <FlatRow
        label="Angle"
        value={`${displayR}°`}
        tier="default"
        disabled={manualRotationEditingDisabled}
        onCommit={(next) => commitManualRotation(next.replace("°", ""))}
        suffix={<KeyframeGutter property="rotation" displayValue={displayR} {...gutterProps} />}
      />
    </>
  );
}

export function LayoutZIndexRow({
  styles,
  onSetStyle,
}: {
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
}) {
  const zIndex = String(parseInt(styles["z-index"] || "auto", 10) || 0);
  return (
    <FlatRow
      label="Z-index"
      value={zIndex}
      tier="default"
      onCommit={(next) => void onSetStyle("z-index", next)}
    />
  );
}

export function LayoutFlexBlock({
  styles,
  onSetStyle,
  disabled,
}: {
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  disabled: boolean;
}) {
  const isFlex = styles.display === "flex" || styles.display === "inline-flex";
  if (!isFlex) return null;
  const direction = styles["flex-direction"] || "row";
  const gap = Number.parseFloat(styles.gap ?? "0") || 0;
  const justify = styles["justify-content"] || "flex-start";
  const align = styles["align-items"] || "stretch";
  const choices = (values: readonly (readonly [string, MessageKey])[], current: string) => {
    const options = values.map(([value, label]) => ({ value, label: t(label) }));
    return options.some((option) => option.value === current)
      ? options
      : [{ value: current, label: current }, ...options];
  };
  return (
    <section aria-label={t("flex.title")} className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold text-studio-text">{t("flex.title")}</h3>
      <FlatField label={t("flex.direction")}>
        <FlatToggleSegment
          label={t("flex.direction")}
          disabled={disabled}
          options={[
            { key: "row", node: t("flex.row"), label: t("flex.row"), active: direction === "row" },
            {
              key: "column",
              node: t("flex.column"),
              label: t("flex.column"),
              active: direction === "column",
            },
          ]}
          onChange={(next) => {
            if (next !== direction) void onSetStyle("flex-direction", next);
          }}
        />
      </FlatField>
      <div className="grid grid-cols-2 gap-3">
        <FlatField label={t("flex.justify")}>
          <InspectorSelect
            label={t("flex.justify")}
            value={justify}
            disabled={disabled}
            options={choices(JUSTIFY_OPTIONS, justify)}
            onChange={(next) => void onSetStyle("justify-content", next)}
          />
        </FlatField>
        <FlatField label={t("flex.align")}>
          <InspectorSelect
            label={t("flex.align")}
            value={align}
            disabled={disabled}
            options={choices(ALIGN_OPTIONS, align)}
            onChange={(next) => void onSetStyle("align-items", next)}
          />
        </FlatField>
      </div>
      <InspectorSlider
        label={t("flex.gap")}
        value={gap}
        min={0}
        max={Math.max(64, gap)}
        disabled={disabled}
        format={(value) => String(Math.round(value))}
        onChange={(value) => void onSetStyle("gap", `${Math.round(value)}px`)}
      />
    </section>
  );
}

const JUSTIFY_OPTIONS = [
  ["flex-start", "flex.start"],
  ["center", "flex.center"],
  ["space-between", "flex.between"],
  ["space-around", "flex.around"],
  ["space-evenly", "flex.evenly"],
  ["flex-end", "flex.end"],
] as const satisfies readonly (readonly [string, MessageKey])[];

const ALIGN_OPTIONS = [
  ["stretch", "flex.stretch"],
  ["flex-start", "flex.start"],
  ["center", "flex.center"],
  ["flex-end", "flex.end"],
  ["baseline", "flex.baseline"],
] as const satisfies readonly (readonly [string, MessageKey])[];

export function LayoutTransform3DBlock({
  gsapRuntimeValues,
  gsapAnimId,
  resolveAnimIdForProp,
  gsapKeyframes,
  currentPct,
  elStart,
  elDuration,
  element,
  onCommitAnimatedProperty,
  onCommitAnimatedProperties,
  onSeekToTime,
  onRemoveKeyframe,
  onConvertToKeyframes,
  onLivePreviewProps,
}: {
  gsapRuntimeValues: Record<string, number>;
  gsapAnimId: string | null;
  resolveAnimIdForProp?: (prop: string) => string | null;
  gsapKeyframes: Array<{
    percentage: number;
    properties: Record<string, number | string>;
    ease?: string;
  }> | null;
  currentPct: number;
  elStart: number;
  elDuration: number;
  element: DomEditSelection;
  onCommitAnimatedProperty?: (
    element: DomEditSelection,
    property: string,
    value: number,
  ) => Promise<void>;
  onCommitAnimatedProperties?: (
    element: DomEditSelection,
    props: Record<string, number | string>,
  ) => Promise<void>;
  onSeekToTime?: (time: number) => void;
  onRemoveKeyframe?: (animId: string, pct: number) => void;
  onConvertToKeyframes?: (animId: string, duration?: number) => void;
  onLivePreviewProps?: (element: DomEditSelection, props: Record<string, number>) => void;
}) {
  return (
    <div>
      <PropertyPanel3dTransform
        gsapRuntimeValues={gsapRuntimeValues}
        gsapAnimId={gsapAnimId}
        resolveAnimIdForProp={resolveAnimIdForProp}
        gsapKeyframes={gsapKeyframes}
        currentPct={currentPct}
        elStart={elStart}
        elDuration={elDuration}
        element={element}
        onCommitAnimatedProperty={onCommitAnimatedProperty}
        onCommitAnimatedProperties={onCommitAnimatedProperties}
        onSeekToTime={onSeekToTime}
        onRemoveKeyframe={onRemoveKeyframe}
        onConvertToKeyframes={onConvertToKeyframes}
        onLivePreviewProps={onLivePreviewProps}
      />
    </div>
  );
}

interface FlatLayoutSectionProps
  extends
    Omit<GeometryRowsProps, never>,
    Pick<
      Parameters<typeof LayoutTransform3DBlock>[0],
      | "gsapRuntimeValues"
      | "resolveAnimIdForProp"
      | "gsapKeyframes"
      | "elStart"
      | "elDuration"
      | "onCommitAnimatedProperties"
      | "onSeekToTime"
      | "onLivePreviewProps"
    > {
  element: DomEditSelection;
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  disabled: boolean;
}

export function FlatLayoutSection({
  element,
  styles,
  onSetStyle,
  disabled,
  gsapRuntimeValues,
  resolveAnimIdForProp,
  gsapKeyframes,
  elStart,
  elDuration,
  onCommitAnimatedProperties,
  onSeekToTime,
  onLivePreviewProps,
  ...geometry
}: FlatLayoutSectionProps) {
  return (
    <div className="space-y-1.5">
      <LayoutGeometryRows element={element} {...geometry} />
      <LayoutZIndexRow styles={styles} onSetStyle={onSetStyle} />
      <LayoutFlexBlock styles={styles} onSetStyle={onSetStyle} disabled={disabled} />
      <LayoutTransform3DBlock
        gsapRuntimeValues={gsapRuntimeValues}
        gsapAnimId={geometry.gsapAnimId}
        resolveAnimIdForProp={resolveAnimIdForProp}
        gsapKeyframes={gsapKeyframes}
        currentPct={geometry.currentPct}
        elStart={elStart}
        elDuration={elDuration}
        element={element}
        onCommitAnimatedProperty={geometry.onCommitAnimatedProperty}
        onCommitAnimatedProperties={onCommitAnimatedProperties}
        onSeekToTime={onSeekToTime}
        onRemoveKeyframe={geometry.onRemoveKeyframe}
        onConvertToKeyframes={geometry.onConvertToKeyframes}
        onLivePreviewProps={onLivePreviewProps}
      />
    </div>
  );
}
