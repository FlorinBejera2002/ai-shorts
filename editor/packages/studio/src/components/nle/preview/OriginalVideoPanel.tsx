// Read-only "Video original" inspector (St-Original): the generated video of an imported SneepCut
// clip. It covers the inspector card while the preview shows `original-export.html`, with the
// Clipuri editabile / Video original switch, the video's details and "Editează clipurile".
// The inspector card belongs to the inspector package, so the panel is portalled into it.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../../i18n/translate";
import { usePlayerStore } from "../../../player/store/playerStore";
import { STUDIO_PREVIEW_FPS } from "../../../player/lib/time";
import { usePanelLayoutContext } from "../../../contexts/PanelLayoutContext";
import { useNLEContext } from "../NLEContext";
import { PreviewIcon, PreviewIconButton } from "./previewChrome";

export const ORIGINAL_EXPORT_PATH = "original-export.html";
export const EDITABLE_INDEX_PATH = "index.html";
const INSPECTOR_CARD_SELECTOR = '[aria-label="Inspector panel"]';

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** "9:16" for 1080×1920; the raw size when the ratio has no short form. */
export function formatAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "—";
  const divisor = greatestCommonDivisor(Math.round(width), Math.round(height));
  const w = Math.round(width) / divisor;
  const h = Math.round(height) / divisor;
  return w <= 32 && h <= 32 ? `${w}:${h}` : `${Math.round(width)}:${Math.round(height)}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Finds the inspector card once it is mounted; null while the inspector is hidden. */
function useInspectorCard(active: boolean, collapsed: boolean): HTMLElement | null {
  const [card, setCard] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active || collapsed) {
      setCard(null);
      return;
    }
    let frame = 0;
    const find = () => {
      const node = document.querySelector<HTMLElement>(INSPECTOR_CARD_SELECTOR);
      if (node) setCard(node);
      else frame = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(frame);
  }, [active, collapsed]);
  return card;
}

/** Clipuri editabile / Video original switch, shared by the panel and the phone sheet. */
export function OriginalVideoSwitch({
  original,
  onChange,
  title,
}: {
  original: boolean;
  onChange: (original: boolean) => void;
  title?: string;
}) {
  useLocale();
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={original === value}
      onClick={() => onChange(value)}
      className={`inline-flex h-10 min-w-0 flex-1 items-center justify-center truncate rounded-full px-3 text-[13px] font-semibold transition-colors ${
        original === value
          ? "bg-studio-selected text-studio-on-selected"
          : "text-studio-text hover:bg-[var(--st-sub)]"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="radiogroup"
      aria-label={t("preview.originalVideo")}
      title={title}
      data-source-import-switch=""
      className="flex flex-none items-center gap-0.5 rounded-full p-1 shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      {option(false, t("preview.editableClips"))}
      {option(true, t("preview.originalVideo"))}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-3 text-[13px]">
      <span className="text-studio-muted">{label}</span>
      <span className="font-semibold tabular-nums text-studio-text">{children}</span>
    </div>
  );
}

function OriginalVideoBody({
  notes,
  onChange,
  onClose,
}: {
  notes: string;
  onChange: (original: boolean) => void;
  onClose: () => void;
}) {
  useLocale();
  const duration = usePlayerStore((s) => s.duration);
  const { previewCompositionSize } = useNLEContext();
  const width = previewCompositionSize?.width ?? 0;
  const height = previewCompositionSize?.height ?? 0;
  return (
    <div
      data-original-video-panel=""
      className="absolute inset-0 z-30 flex flex-col gap-[18px] bg-studio-surface p-4 text-studio-text"
    >
      <div className="flex min-h-9 items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold leading-6">
          {t("preview.originalVideo")}
        </h2>
        <span className="inline-flex h-7 flex-none items-center gap-1.5 rounded-sm bg-[var(--st-sub)] px-2 text-xs font-semibold text-studio-muted">
          <PreviewIcon name="lock" size={12} />
          {t("preview.readOnly")}
        </span>
        <PreviewIconButton label={t("preview.close")} size={32} onClick={onClose}>
          <PreviewIcon name="close" size={16} />
        </PreviewIconButton>
      </div>
      <OriginalVideoSwitch original onChange={onChange} title={notes} />
      <section className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        <h3 className="m-0 flex min-h-7 items-center text-[13px] font-semibold">
          {t("preview.details")}
        </h3>
        <DetailRow label={t("preview.duration")}>{formatDuration(duration)}</DetailRow>
        <DetailRow label={t("preview.format")}>{formatAspectRatio(width, height)}</DetailRow>
        <DetailRow label={t("preview.resolution")}>
          {width > 0 ? `${Math.round(width)} × ${Math.round(height)}` : "—"}
        </DetailRow>
        <DetailRow label={t("preview.frameRate")}>{STUDIO_PREVIEW_FPS}</DetailRow>
      </section>
      <button
        type="button"
        onClick={() => onChange(false)}
        className="h-11 w-full flex-none rounded-full bg-studio-accent text-[13px] font-semibold text-studio-on-accent outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-btn)] focus-visible:ring-offset-2"
      >
        {t("preview.backToClips")}
      </button>
    </div>
  );
}

/** Mounts the read-only panel over the inspector card while the original video is shown. */
export function OriginalVideoInspector({
  original,
  notes,
  onChange,
}: {
  original: boolean;
  notes: string;
  onChange: (original: boolean) => void;
}) {
  const { effectiveRightCollapsed, setRightCollapsed } = usePanelLayoutContext();
  const card = useInspectorCard(original, effectiveRightCollapsed);
  if (!original || !card) return null;
  return createPortal(
    <OriginalVideoBody notes={notes} onChange={onChange} onClose={() => setRightCollapsed(true)} />,
    card,
  );
}
