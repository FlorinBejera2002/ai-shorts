import { useEffect, useRef, useState } from "react";
import type { ColorGradingCapturedFrame } from "./useColorGradingPreviews";
import {
  type ColorGradingScopeAnalysis,
  type ColorGradingScopeMode,
} from "./colorGradingFrameAnalysis";
import { useColorGradingScopes } from "./useColorGradingScopes";
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import { LookMenuSelect } from "./propertyPanelColorLookSelect";
import { LOOK_ICONS, LookIconButton } from "./propertyPanelColorLookUi";

// St-Inspector-Scopes: "Scop" select (Histogramă, Formă de undă, RGB Parade, Vectorscop,
// Oprit) and the refresh button beside the title. The scope itself stays an instrument display.
const MODES: readonly ColorGradingScopeMode[] = ["histogram", "waveform", "parade", "vectorscope"];
const MODE_LABEL: Record<ColorGradingScopeMode, MessageKey> = {
  histogram: "look.scope.histogram",
  waveform: "look.scope.waveform",
  parade: "look.scope.parade",
  vectorscope: "look.scope.vectorscope",
};

function densityAlpha(value: number, maximum: number): number {
  if (value === 0 || maximum === 0) return 0;
  return Math.min(1, Math.log2(value + 1) / Math.log2(maximum + 1));
}

function maximumDensity(values: Uint32Array): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return maximum;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "rgb(9 11 14)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  for (const fraction of [0.25, 0.5, 0.75]) {
    context.beginPath();
    context.moveTo(0, Math.round(height * fraction) + 0.5);
    context.lineTo(width, Math.round(height * fraction) + 0.5);
    context.stroke();
  }
}

function drawHistogram(
  context: CanvasRenderingContext2D,
  analysis: ColorGradingScopeAnalysis,
  width: number,
  height: number,
) {
  const maximum = maximumDensity(analysis.histogram);
  context.beginPath();
  context.moveTo(0, height);
  analysis.histogram.forEach((count, index) => {
    context.lineTo((index / 255) * width, height - densityAlpha(count, maximum) * height);
  });
  context.lineTo(width, height);
  context.closePath();
  context.fillStyle = "rgba(226, 232, 240, 0.2)";
  context.fill();
  context.strokeStyle = "rgba(226, 232, 240, 0.9)";
  context.stroke();
}

function drawDensity(
  context: CanvasRenderingContext2D,
  density: Uint32Array,
  columnOffset: number,
  columnCount: number,
  color: readonly [number, number, number],
  xOffset: number,
  outputWidth: number,
  height: number,
) {
  let maximum = 0;
  const start = columnOffset * 256;
  const end = (columnOffset + columnCount) * 256;
  for (let index = start; index < end; index += 1) maximum = Math.max(maximum, density[index] ?? 0);
  context.fillStyle = `rgb(${color.join(" ")})`;
  for (let x = 0; x < columnCount; x += 1) {
    for (let y = 0; y < 256; y += 1) {
      const alpha = density[(columnOffset + x) * 256 + y] ?? 0;
      if (!alpha) continue;
      context.globalAlpha = densityAlpha(alpha, maximum);
      context.fillRect(
        xOffset + (x / columnCount) * outputWidth,
        (y / 255) * height,
        Math.max(1, outputWidth / columnCount),
        Math.max(1, height / 256),
      );
    }
  }
  context.globalAlpha = 1;
}

function drawVectorscope(
  context: CanvasRenderingContext2D,
  analysis: ColorGradingScopeAnalysis,
  width: number,
  height: number,
) {
  const maximum = maximumDensity(analysis.vectorscope);
  const centerX = width / 2;
  const centerY = height / 2;
  context.strokeStyle = "rgba(255,255,255,0.12)";
  context.beginPath();
  context.arc(centerX, centerY, Math.min(width, height) * 0.42, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(centerX, 0);
  context.lineTo(centerX, height);
  context.moveTo(0, centerY);
  context.lineTo(width, centerY);
  context.stroke();
  const skinAngle = (-123 * Math.PI) / 180;
  context.strokeStyle = "rgba(251,191,36,0.3)";
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(
    centerX + Math.cos(skinAngle) * Math.min(width, height) * 0.45,
    centerY + Math.sin(skinAngle) * Math.min(width, height) * 0.45,
  );
  context.stroke();
  context.fillStyle = "rgb(110 231 183)";
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const count = analysis.vectorscope[y * 256 + x] ?? 0;
      if (!count) continue;
      context.globalAlpha = densityAlpha(count, maximum);
      context.fillRect(
        (x / 255) * width,
        (y / 255) * height,
        Math.max(1, width / 256),
        Math.max(1, height / 256),
      );
    }
  }
  context.globalAlpha = 1;
}

function drawScope(
  canvas: HTMLCanvasElement,
  mode: ColorGradingScopeMode,
  analysis: ColorGradingScopeAnalysis,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  drawGrid(context, width, height);
  if (mode === "histogram") {
    drawHistogram(context, analysis, width, height);
  } else if (mode === "waveform") {
    drawDensity(context, analysis.waveform, 0, analysis.width, [226, 232, 240], 0, width, height);
  } else if (mode === "parade") {
    const laneWidth = width / 3;
    (
      [
        [0, [248, 113, 113]],
        [1, [74, 222, 128]],
        [2, [96, 165, 250]],
      ] as const
    ).forEach(([channel, color]) => {
      drawDensity(
        context,
        analysis.parade,
        channel * analysis.width,
        analysis.width,
        color,
        channel * laneWidth,
        laneWidth,
        height,
      );
    });
  } else {
    drawVectorscope(context, analysis, width, height);
  }
}

export function PropertyPanelColorScopes({
  captureFrame,
  refreshKey,
}: {
  captureFrame: () => Promise<ColorGradingCapturedFrame | null>;
  refreshKey: string;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ColorGradingScopeMode>("waveform");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { analysis, status, refresh } = useColorGradingScopes({
    open,
    captureFrame,
    refreshKey,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (analysis) {
      drawScope(canvas, mode, analysis);
      return;
    }
    const context = canvas.getContext("2d");
    if (context) drawGrid(context, canvas.width, canvas.height);
  }, [analysis, mode, open]);

  const modeLabel = t(MODE_LABEL[mode]);
  return (
    <section data-flat-grade-scopes="true" className="flex flex-col gap-2.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-studio-text">{t("look.scope.label")}</h4>
        {open && (
          <LookIconButton
            label={t("look.scope.refresh")}
            icon={LOOK_ICONS.refresh}
            onClick={refresh}
          />
        )}
      </div>
      <div data-flat-grade-scope-mode="true">
        <LookMenuSelect
          name="scope"
          label={t("look.scope.label")}
          value={open ? mode : "off"}
          options={[
            ...MODES.map((candidate) => ({ value: candidate, label: t(MODE_LABEL[candidate]) })),
            { value: "off" as const, label: t("look.scope.off") },
          ]}
          onChange={(next) => {
            if (next === "off") {
              setOpen(false);
              return;
            }
            setMode(next);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <canvas
          ref={canvasRef}
          width={320}
          height={144}
          role="img"
          aria-label={t("look.scope.aria", { name: modeLabel, status })}
          className="block h-auto w-full rounded-md"
        />
      )}
    </section>
  );
}
