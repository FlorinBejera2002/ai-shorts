import { memo, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../utils/clipboard";
import { t, useLocale } from "../../i18n/translate";
import type { FfmpegStatus } from "./useFfmpegStatus";
import { OutputButton } from "../output/OutputButton";
import { OutputIcon } from "../output/OutputIcon";

const DOWNLOAD_URL = "https://ffmpeg.org/download.html";
const CUE_MS = 1600;

/**
 * Shown above Export when the dev server reports no usable FFmpeg.
 *
 * This exists because the failure it replaces was the single most reported
 * Studio problem: the user built a composition, pressed Export, and got
 * "Server error (503)". The encoder had never been installed, the server knew
 * that, and nothing said so. Saying it before the work starts, with a command
 * they can paste, is the whole point, so the command is the loudest element
 * here and not the apology.
 */
export const FfmpegRequiredNotice = memo(function FfmpegRequiredNotice({
  status,
  checking,
  onRecheck,
}: {
  status: FfmpegStatus;
  checking: boolean;
  onRecheck: () => void;
}) {
  useLocale();
  const [copied, setCopied] = useState(false);
  // A recheck that finds nothing changes no other pixel on screen, so without
  // this the button reads as broken at the exact moment the user is most
  // unsure. Motion alone would not do: the result has to survive being missed.
  const [recheckFailed, setRecheckFailed] = useState(false);
  const wasChecking = useRef(false);
  const cueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Still mounted after a check finished means the answer was "still no":
    // a success unmounts this card entirely.
    if (wasChecking.current && !checking) setRecheckFailed(true);
    wasChecking.current = checking;
  }, [checking]);

  useEffect(() => {
    if (!recheckFailed) return;
    cueTimer.current = setTimeout(() => setRecheckFailed(false), CUE_MS);
    return () => clearTimeout(cueTimer.current);
  }, [recheckFailed]);

  useEffect(() => () => clearTimeout(cueTimer.current), []);

  const copy = async (command: string) => {
    const ok = await copyTextToClipboard(command);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), CUE_MS);
  };

  return (
    <section
      role="alert"
      aria-label={t("output.ffmpegNotFound")}
      className="flex flex-col gap-3.5 rounded-[20px] bg-studio-surface p-3.5 text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[var(--st-warn)] shadow-[inset_0_0_0_1px_var(--st-bd)]"
        >
          <OutputIcon name="warn" size={18} />
        </span>
        <b className="text-sm font-semibold">{t("output.ffmpegNotFound")}</b>
      </div>
      {status.command ? (
        <code
          aria-label={t("output.ffmpegCommandAria")}
          className="block rounded-xl bg-[var(--st-in)] px-3 py-2.5 font-mono text-xs [overflow-wrap:anywhere]"
        >
          {status.command}
        </code>
      ) : (
        status.hint && <span className="text-[13px] leading-[18px]">{status.hint}</span>
      )}
      {/* Last before the actions and only ever appended, so it moves nothing above it. */}
      <span
        aria-live="polite"
        className="text-[13px] font-semibold text-[var(--st-danger)] empty:hidden"
      >
        {recheckFailed ? t("output.stillNotFound") : ""}
      </span>
      <div className="flex gap-2">
        {status.command ? (
          <OutputButton
            variant="secondary"
            height={36}
            padX={12}
            fontSize={12}
            icon={copied ? "check" : "copy"}
            iconSize={14}
            stretch
            onClick={() => void copy(status.command ?? "")}
          >
            {copied ? t("output.copied") : t("output.copy")}
          </OutputButton>
        ) : null}
        <OutputButton
          variant="primary"
          height={36}
          padX={12}
          fontSize={12}
          icon={checking ? "refresh" : undefined}
          iconSize={14}
          stretch
          disabled={checking}
          onClick={onRecheck}
        >
          {checking ? t("output.checking") : t("output.recheck")}
        </OutputButton>
      </div>
      <a
        href={DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className="self-center rounded-sm text-[13px] font-semibold text-studio-text underline underline-offset-[3px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
      >
        {t("output.otherInstallOptions")}
      </a>
    </section>
  );
});
