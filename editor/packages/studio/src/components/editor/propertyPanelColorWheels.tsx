import { useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  getHfColorGradingCapabilities,
  type HfColorGradingWheelKey,
  type NormalizedHfColorGradingWheels,
} from "@hyperframes/core/color-grading";
import { t, useLocale } from "../../i18n/translate";
import { wheelLabel } from "./propertyPanelColorLabels";
import { LOOK_ICONS, LookIcon } from "./propertyPanelColorLookUi";
import { clampNumber } from "../../utils/studioHelpers";
import { GradingNumberField } from "./propertyPanelGradingNumberField";
import { useInspectorGestureDraft } from "./useInspectorGestureTransaction";

const WHEELS: readonly HfColorGradingWheelKey[] = ["shadows", "midtones", "highlights"];
type NormalizedTonalWheel = NormalizedHfColorGradingWheels[HfColorGradingWheelKey];

const WHEEL_CONTROLS = getHfColorGradingCapabilities().wheels.controls;
const PERCENT_SCALE = 100;
const RESET_WHEEL: NormalizedTonalWheel = {
  hue: WHEEL_CONTROLS.hue.identity,
  amount: WHEEL_CONTROLS.amount.identity,
  level: WHEEL_CONTROLS.level.identity,
};

function wrapHue(value: number): number {
  const { min, maxExclusive } = WHEEL_CONTROLS.hue;
  const span = maxExclusive - min;
  return ((((value - min) % span) + span) % span) + min;
}

function formatNumberInput(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

const formatIntegerInput = (value: number) => formatNumberInput(value, 0);

function wheelFromPointer(
  wheel: NormalizedTonalWheel,
  clientX: number,
  clientY: number,
  rect: DOMRect,
): NormalizedTonalWheel {
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
  const x = (clientX - (rect.left + rect.width / 2)) / radius;
  const y = (rect.top + rect.height / 2 - clientY) / radius;
  return {
    ...wheel,
    hue: wrapHue((Math.atan2(y, x) * 180) / Math.PI),
    amount: clampNumber(Math.hypot(x, y), WHEEL_CONTROLS.amount.min, WHEEL_CONTROLS.amount.max),
  };
}

function updateWheel(
  value: NormalizedHfColorGradingWheels,
  key: HfColorGradingWheelKey,
  wheel: NormalizedTonalWheel,
): NormalizedHfColorGradingWheels {
  return { ...value, [key]: wheel };
}

function wheelFromKey(
  wheel: NormalizedTonalWheel,
  key: string,
  large: boolean,
): NormalizedTonalWheel | null {
  const hueStep = large ? 10 : 1;
  const amountStep = large ? 0.1 : 0.01;
  switch (key) {
    case "ArrowLeft":
      return { ...wheel, hue: wrapHue(wheel.hue - hueStep) };
    case "ArrowRight":
      return { ...wheel, hue: wrapHue(wheel.hue + hueStep) };
    case "ArrowDown":
      return {
        ...wheel,
        amount: clampNumber(
          wheel.amount - amountStep,
          WHEEL_CONTROLS.amount.min,
          WHEEL_CONTROLS.amount.max,
        ),
      };
    case "ArrowUp":
      return {
        ...wheel,
        amount: clampNumber(
          wheel.amount + amountStep,
          WHEEL_CONTROLS.amount.min,
          WHEEL_CONTROLS.amount.max,
        ),
      };
    case "Home":
      return { ...wheel, amount: WHEEL_CONTROLS.amount.min };
    case "End":
      return { ...wheel, amount: WHEEL_CONTROLS.amount.max };
    default:
      return null;
  }
}

function TonalWheel({
  wheelKey,
  label,
  wheel,
  disabled,
  onBegin,
  onPreview,
  onSettle,
  onCancel,
  onReset,
  compact = false,
}: {
  /** Wheel only (St-M-Inspector-Wheels); amount and level stay on the wheels view. */
  compact?: boolean;
  wheelKey: HfColorGradingWheelKey;
  label: string;
  wheel: NormalizedTonalWheel;
  disabled?: boolean;
  onBegin: () => void;
  onPreview: (wheel: NormalizedTonalWheel) => void;
  onSettle: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const hueRadians = (wheel.hue * Math.PI) / 180;
  const thumbLeft = 50 + Math.cos(hueRadians) * wheel.amount * 46;
  const thumbTop = 50 - Math.sin(hueRadians) * wheel.amount * 46;

  const previewPointer = (target: HTMLDivElement, clientX: number, clientY: number) => {
    onPreview(wheelFromPointer(wheel, clientX, clientY, target.getBoundingClientRect()));
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    const next = wheelFromKey(wheel, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    onBegin();
    onPreview(next);
  };

  return (
    <div data-color-wheel={wheelKey} className="group/wheel flex min-w-0 flex-col gap-3">
      <div className="flex flex-col items-center gap-2">
        <div className="relative flex w-full items-center justify-center">
          <span className="truncate text-[12px] font-semibold text-studio-text">{label}</span>
          <button
            type="button"
            aria-label={t("look.wheel.reset", { name: label })}
            title={t("look.wheel.reset", { name: label })}
            disabled={disabled}
            onClick={onReset}
            className="absolute right-0 flex h-5 w-5 items-center justify-center rounded-full text-studio-muted opacity-0 transition-opacity group-hover/wheel:opacity-100 hover:bg-[var(--st-sub)] hover:text-studio-text focus-visible:opacity-100 disabled:opacity-0"
          >
            <LookIcon d={LOOK_ICONS.reset} size={12} />
          </button>
        </div>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={t("look.wheel.color", { name: label })}
          aria-valuemin={WHEEL_CONTROLS.amount.min * PERCENT_SCALE}
          aria-valuemax={WHEEL_CONTROLS.amount.max * PERCENT_SCALE}
          aria-valuenow={Math.round(wheel.amount * PERCENT_SCALE)}
          aria-valuetext={`${Math.round(wheel.hue)} degrees, ${Math.round(
            wheel.amount * PERCENT_SCALE,
          )} percent`}
          aria-disabled={disabled}
          data-color-wheel-surface="true"
          onDoubleClick={onReset}
          onPointerDown={(event) => {
            if (disabled) return;
            event.preventDefault();
            onBegin();
            pointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            previewPointer(event.currentTarget, event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (disabled || pointerIdRef.current !== event.pointerId) return;
            previewPointer(event.currentTarget, event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            previewPointer(event.currentTarget, event.clientX, event.clientY);
            pointerIdRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onSettle();
          }}
          onPointerCancel={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            pointerIdRef.current = null;
            onCancel();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
            ) {
              onSettle();
            }
          }}
          onBlur={onSettle}
          className="relative mx-auto aspect-square w-full max-w-[88px] touch-none rounded-full shadow-[inset_0_0_0_1px_var(--st-bd)] outline-none focus-visible:shadow-[0_0_0_2px_var(--st-btn)] aria-disabled:opacity-40"
          style={{ background: WHEEL_BACKGROUND }}
        >
          <span
            data-color-wheel-thumb="true"
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-studio-surface shadow-[0_0_0_2px_var(--st-tx)]"
            style={{ left: `${thumbLeft}%`, top: `${thumbTop}%` }}
          />
        </div>
      </div>
      {!compact && (
        <>
          <div className="flex flex-col gap-1.5">
            <GradingNumberField
              label={t("look.wheel.amount")}
              value={wheel.amount * PERCENT_SCALE}
              min={WHEEL_CONTROLS.amount.min * PERCENT_SCALE}
              max={WHEEL_CONTROLS.amount.max * PERCENT_SCALE}
              disabled={disabled}
              formatValue={formatIntegerInput}
              labelClassName={WHEEL_ROW}
              labelTextClassName={WHEEL_ROW_LABEL}
              inputClassName="w-7 flex-none !px-0 text-right"
              onBegin={onBegin}
              onPreview={(amount) => onPreview({ ...wheel, amount: amount / PERCENT_SCALE })}
              onSettle={onSettle}
              onCancel={onCancel}
            />
            <span
              aria-hidden="true"
              className="block h-1 overflow-hidden rounded-full bg-[var(--st-hd)]"
            >
              <span
                className="block h-full rounded-full bg-[var(--st-tx)]"
                style={{ width: `${Math.round(wheel.amount * 100)}%` }}
              />
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <GradingNumberField
              label={t("look.wheel.level")}
              value={wheel.level * PERCENT_SCALE}
              min={WHEEL_CONTROLS.level.min * PERCENT_SCALE}
              max={WHEEL_CONTROLS.level.max * PERCENT_SCALE}
              disabled={disabled}
              formatValue={formatIntegerInput}
              labelClassName={WHEEL_ROW}
              labelTextClassName={WHEEL_ROW_LABEL}
              inputClassName="w-7 flex-none !px-0 text-right"
              onBegin={onBegin}
              onPreview={(level) => onPreview({ ...wheel, level: level / PERCENT_SCALE })}
              onSettle={onSettle}
              onCancel={onCancel}
            />
            <input
              type="range"
              aria-label={t("look.wheel.levelAria", { name: label })}
              min={WHEEL_CONTROLS.level.min}
              max={WHEEL_CONTROLS.level.max}
              step={0.01}
              value={wheel.level}
              disabled={disabled}
              onPointerDown={onBegin}
              onChange={(event) => onPreview({ ...wheel, level: Number(event.target.value) })}
              onPointerUp={onSettle}
              onPointerCancel={onCancel}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancel();
                } else {
                  onBegin();
                }
              }}
              onKeyUp={onSettle}
              onBlur={onSettle}
              data-color-wheel-level="true"
              style={{ "--look-fill": `${levelFill(wheel.level)}%` } as CSSProperties}
              className="w-full"
            />
          </div>
        </>
      )}
    </div>
  );
}

const WHEEL_ROW = "flex min-w-0 items-center justify-between gap-0.5";

/** Level bar fill (St-Inspector-Wheels): the neutral level sits at the middle of the bar. */
function levelFill(level: number): number {
  const { min, max } = WHEEL_CONTROLS.level;
  return Math.round(((level - min) / Math.max(max - min, 1e-6)) * 100);
}
const WHEEL_ROW_LABEL = "min-w-0 flex-1 truncate text-[12px] font-medium text-studio-text";
// Hue ring (data colours, not decoration) fading into the card surface at the centre.
const WHEEL_BACKGROUND =
  "radial-gradient(circle closest-side, var(--st-sf) 0%, var(--st-sf) 28%, transparent 100%), conic-gradient(from 90deg, rgb(255 51 51), rgb(255 51 255), rgb(51 51 255), rgb(51 255 255), rgb(51 255 51), rgb(255 255 51), rgb(255 51 51))";

export function ColorWheels({
  value,
  disabled,
  compact,
  onPreview,
  onCommit,
}: {
  value: NormalizedHfColorGradingWheels;
  disabled?: boolean;
  /** Wheels only, without the amount and level rows (phone, St-M-Inspector-Wheels). */
  compact?: boolean;
  onPreview: (value: NormalizedHfColorGradingWheels) => void;
  onCommit: (value: NormalizedHfColorGradingWheels) => void;
}) {
  useLocale();
  const { draft, setDraft, transaction } = useInspectorGestureDraft({
    sourceValue: value,
    onPreview,
    onCommit,
  });

  const previewWheel = (key: HfColorGradingWheelKey, wheel: NormalizedTonalWheel) =>
    transaction.preview(updateWheel(draft, key, wheel));
  const resetWheel = (key: HfColorGradingWheelKey) => {
    transaction.cancel();
    const next = updateWheel(draft, key, RESET_WHEEL);
    setDraft(next);
    onCommit(next);
  };

  return (
    <div data-color-wheels="true" className="grid grid-cols-3 gap-2.5">
      {WHEELS.map((key) => (
        <TonalWheel
          key={key}
          wheelKey={key}
          label={wheelLabel(key)}
          wheel={draft[key]}
          disabled={disabled}
          compact={compact}
          onBegin={transaction.begin}
          onPreview={(wheel) => previewWheel(key, wheel)}
          onSettle={transaction.settle}
          onCancel={transaction.cancel}
          onReset={() => resetWheel(key)}
        />
      ))}
    </div>
  );
}
