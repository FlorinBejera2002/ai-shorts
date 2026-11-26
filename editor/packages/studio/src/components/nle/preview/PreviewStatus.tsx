// Preview card states: composition loading (St-Preview-Loading), asset preparation
// (St-Preview-AssetPrep) and a failed load with retry (St-PreviewError).
import type { ReactNode } from "react";
import { t, useLocale } from "../../../i18n/translate";
import { illustrationSrc } from "../../ui";
import { OutlinePill, PreviewIcon, PrimaryPill } from "./previewChrome";

const STATUS_CARD_SHADOW =
  "[box-shadow:var(--st-sh),0_30px_80px_color-mix(in_srgb,black_22%,transparent),inset_0_0_0_1px_var(--st-bd)]";

/** Scrim over the whole preview card (24px radius) with a centred status card. */
function StatusScrim({
  label,
  width,
  children,
}: {
  label: string;
  width: 340 | 380;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-[70] select-none rounded-[inherit]"
      data-hyperframes-ignore=""
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      <div aria-hidden="true" className="absolute inset-0 rounded-[inherit] bg-[var(--st-ov)]" />
      <div
        role="status"
        aria-label={label}
        className={`absolute left-1/2 top-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 rounded-card bg-studio-surface px-6 py-7 text-center ${STATUS_CARD_SHADOW}`}
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusTitle({ children }: { children: string }) {
  return (
    <b className="text-balance font-display text-lg font-semibold leading-6 text-studio-text">
      {children}
    </b>
  );
}

export function CompositionLoadingOverlay() {
  useLocale();
  return (
    <StatusScrim label={t("preview.loadingComposition")} width={340}>
      <span
        aria-hidden="true"
        className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-[var(--st-sub)] text-studio-text"
      >
        <PreviewIcon name="refresh" size={22} className="motion-safe:animate-spin" />
      </span>
      <StatusTitle>{t("preview.loadingComposition")}</StatusTitle>
      <span className="text-[13px] text-studio-muted" data-testid="composition-loading-overlay">
        {t("preview.loadingDetail")}
      </span>
    </StatusScrim>
  );
}

export function AssetPrepOverlay({
  fading,
  showContinue,
  onContinue,
}: {
  fading: boolean;
  showContinue: boolean;
  onContinue: () => void;
}) {
  useLocale();
  return (
    <div
      className="absolute inset-0 z-[70] rounded-[inherit]"
      style={{
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
        transition: "opacity 180ms ease-in",
      }}
    >
      <StatusScrim label={t("preview.preparingAssets")} width={380}>
        <img
          src={illustrationSrc("studio-import")}
          alt=""
          width={120}
          height={120}
          className="block h-[120px] w-[120px] flex-none object-contain"
        />
        <StatusTitle>{t("preview.preparingAssets")}</StatusTitle>
        <span className="text-[13px] text-studio-muted">{t("preview.preparingAssetsDetail")}</span>
        <span
          role="progressbar"
          aria-label={t("preview.progress")}
          className="relative block h-1.5 w-full overflow-hidden rounded-full bg-[var(--st-hd)]"
        >
          <span className="absolute motion-safe:animate-pulse inset-y-0 left-0 w-3/5 rounded-full bg-studio-text" />
        </span>
        {showContinue && (
          <OutlinePill height={40} onClick={onContinue}>
            {t("preview.continueAnyway")}
          </OutlinePill>
        )}
      </StatusScrim>
    </div>
  );
}

/** Failed load inside the stage frame: illustration, title and "Reîncearcă". */
export function PreviewErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  useLocale();
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center rounded-sm bg-[var(--st-in)] p-6 shadow-[inset_0_0_0_1px_var(--st-bd)]"
      data-hyperframes-ignore=""
      data-testid="composition-preview-error"
      title={message}
    >
      <div className="flex min-w-0 flex-col items-center gap-3.5 text-center">
        <img
          src={illustrationSrc("studio-preview-error")}
          alt=""
          width={120}
          height={120}
          className="block h-[120px] w-[120px] flex-none object-contain"
        />
        <b className="text-balance font-display text-[15px] font-semibold leading-[23px] text-studio-text">
          {t("preview.failed")}
        </b>
        <PrimaryPill height={40} onClick={onRetry}>
          {t("preview.retry")}
        </PrimaryPill>
      </div>
    </div>
  );
}
