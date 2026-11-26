import { useState } from "react";
import type { HfColorCurvePoint, HfHueCurvePoint } from "@hyperframes/core/color-grading";
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import { LookMenuSelect } from "./propertyPanelColorLookSelect";
import {
  CurveGraph,
  formatPointValue,
  movePoint,
  pointsFor,
  RGB_IDENTITY,
  TABS,
  type ColorCurveValues,
  type CurveTab,
  withPoints,
} from "./propertyPanelColorCurveGraph";
import { GradingNumberField } from "./propertyPanelGradingNumberField";
import { useInspectorGestureDraft } from "./useInspectorGestureTransaction";

export type { ColorCurveValues } from "./propertyPanelColorCurveGraph";

export function ColorCurves({
  value,
  disabled,
  onPreview,
  onCommit,
}: {
  value: ColorCurveValues;
  disabled?: boolean;
  onPreview: (value: ColorCurveValues) => void;
  onCommit: (value: ColorCurveValues) => void;
}) {
  useLocale();
  const [activeKey, setActiveKey] = useState<CurveTab["key"]>("master");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { draft, setDraft, transaction } = useInspectorGestureDraft({
    sourceValue: value,
    onPreview,
    onCommit,
  });
  const tab = TABS.find((candidate) => candidate.key === activeKey) ?? TABS[0];
  if (!tab) throw new Error("Color curve tabs are unavailable");
  const points = pointsFor(draft, tab);

  const previewPoints = (
    nextPoints: readonly (HfColorCurvePoint | HfHueCurvePoint)[],
    nextSelectedIndex: number,
  ) => {
    setSelectedIndex(nextSelectedIndex);
    transaction.preview(withPoints(draft, tab, nextPoints));
  };
  const resetActive = () => {
    transaction.cancel();
    const next = withPoints(draft, tab, tab.kind === "rgb" ? RGB_IDENTITY : []);
    setDraft(next);
    setSelectedIndex(null);
    onCommit(next);
  };
  const deleteSelected = () => {
    if (selectedIndex === null) return;
    if (tab.kind === "rgb" && (selectedIndex === 0 || selectedIndex === points.length - 1)) return;
    transaction.cancel();
    const nextPoints =
      tab.kind === "hue" && points.length <= 3
        ? []
        : points.filter((_, index) => index !== selectedIndex);
    const next = withPoints(draft, tab, nextPoints);
    setDraft(next);
    setSelectedIndex(null);
    onCommit(next);
  };
  const updateSelected = (axis: "input" | "output", rawValue: number) => {
    if (selectedIndex === null || !Number.isFinite(rawValue)) return;
    const point = points[selectedIndex];
    if (!point) return;
    const moved = movePoint(
      points,
      selectedIndex,
      axis === "input" ? rawValue : point[0],
      axis === "output" ? rawValue : point[1],
      tab,
    );
    previewPoints(moved.points, moved.selected);
  };
  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const endpointSelected =
    tab.kind === "rgb" &&
    selectedIndex !== null &&
    (selectedIndex === 0 || selectedIndex === points.length - 1);

  return (
    <div data-color-curves="true" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2" data-color-curve-channel="true">
        <span className="text-[13px] font-semibold text-studio-text">
          {t("look.curve.channel")}
        </span>
        <LookMenuSelect
          name="curve-channel"
          label={t("look.curve.channel")}
          value={tab.key}
          disabled={disabled}
          options={TABS.map((candidate) => ({
            value: candidate.key,
            label: t(CHANNEL_LABEL[candidate.key]),
          }))}
          onChange={(key) => {
            transaction.cancel();
            setActiveKey(key);
            setSelectedIndex(null);
          }}
        />
      </div>
      <CurveGraph
        tab={tab}
        points={points}
        selectedIndex={selectedIndex}
        disabled={disabled}
        onBegin={transaction.begin}
        onPreview={previewPoints}
        onSelect={setSelectedIndex}
        onDelete={deleteSelected}
        onSettle={transaction.settle}
        onCancel={transaction.cancel}
      />
      {selectedPoint && (
        <div className="flex items-end gap-3">
          <GradingNumberField
            label={tab.kind === "rgb" ? t("look.curve.input") : t("look.curve.hue")}
            ariaLabel={`Curve point ${tab.kind === "rgb" ? "input" : "hue"}`}
            value={formatPointValue(selectedPoint[0], tab, "input")}
            min={0}
            max={tab.kind === "rgb" ? 1 : 359.999}
            disabled={disabled || endpointSelected}
            labelClassName={POINT_FIELD}
            labelTextClassName={POINT_LABEL}
            inputClassName="block w-full text-left"
            onBegin={transaction.begin}
            onPreview={(next) => updateSelected("input", next)}
            onSettle={transaction.settle}
            onCancel={transaction.cancel}
          />
          <GradingNumberField
            label={t("look.curve.output")}
            ariaLabel="Curve point output"
            value={formatPointValue(selectedPoint[1], tab, "output")}
            min={tab.min}
            max={tab.max}
            disabled={disabled}
            labelClassName={POINT_FIELD}
            labelTextClassName={POINT_LABEL}
            inputClassName="block w-full text-left"
            onBegin={transaction.begin}
            onPreview={(next) => updateSelected("output", next)}
            onSettle={transaction.settle}
            onCancel={transaction.cancel}
          />
          <button
            type="button"
            disabled={disabled || endpointSelected}
            onClick={deleteSelected}
            className="h-8 rounded-full px-3 text-[12px] font-medium text-studio-danger hover:bg-[var(--st-danger-bg)] disabled:opacity-30"
          >
            {t("look.curve.delete")}
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label={t("look.curve.resetAria", { name: t(CHANNEL_LABEL[tab.key]) })}
        title={t("look.curve.resetAria", { name: t(CHANNEL_LABEL[tab.key]) })}
        disabled={disabled}
        onClick={resetActive}
        className="mx-auto h-9 rounded-full px-4 text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)] disabled:opacity-40"
      >
        {t("look.curve.reset")}
      </button>
    </div>
  );
}

const POINT_FIELD = "flex min-w-0 flex-1 flex-col gap-1";
const POINT_LABEL = "block text-[12px] font-medium text-studio-muted";

const CHANNEL_LABEL: Record<CurveTab["key"], MessageKey> = {
  master: "look.curve.master",
  red: "look.curve.red",
  green: "look.curve.green",
  blue: "look.curve.blue",
  hueVsHue: "look.curve.hueVsHue",
  hueVsSaturation: "look.curve.hueVsSaturation",
  hueVsLuma: "look.curve.hueVsLuma",
};
