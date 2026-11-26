import { useEffect, useRef, useState } from "react";
import {
  readStudioSessionInfo,
  startStudioSessionRenewal,
  type StudioSessionInfo,
} from "../utils/studioSessionRenewal";
import { t, useLocale } from "../i18n/translate";
import { trustStudioThemeOrigin } from "../theme/studioTheme";
import { OutputButton } from "./output/OutputButton";
import { OutputAlertCard } from "./output/OutputFields";
import { useIsPhone } from "./shell/useIsPhone";
import { StudioConnectionLost } from "./StudioConnectionLost";
import { ExportFlowHost } from "./renders/ExportFlowHost";
import { useConnectionLost } from "./useConnectionLost";

/**
 * Session-level overlays, mounted once by the top bar: the connection-lost dialog, the export
 * flow and, on the authenticated SneepCut host only, the session renewal frame.
 */
export function StudioSession() {
  useLocale();
  const isPhone = useIsPhone();
  const [info, setInfo] = useState<StudioSessionInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [frameAttempt, setFrameAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const connection = useConnectionLost();

  useEffect(() => {
    if (!document.querySelector('meta[name="sneepcut-session"][content="enabled"]')) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void fetch("/sneepcut/session-info", { signal, credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session unavailable");
        const session = readStudioSessionInfo(await response.json());
        if (!session) throw new Error("Invalid session configuration");
        if (controller.signal.aborted) return;
        // The session frame also carries the app theme, so a change there reaches Studio live.
        trustStudioThemeOrigin(session.appOrigin);
        setInfo(session);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!info) return;
    const active = startStudioSessionRenewal(
      info,
      () => frame.current?.contentWindow ?? null,
      setFailed,
    );
    return () => active.stop();
  }, [info, frameAttempt]);

  return (
    <>
      <StudioConnectionLost state={connection} loginUrl={info ? `${info.appOrigin}/login` : null} />
      <ExportFlowHost />
      {info && (
        <iframe
          key={frameAttempt}
          ref={frame}
          src={`${info.appOrigin}/studio-session`}
          title={t("states.signInFrame")}
          hidden
        />
      )}
      {failed && (
        // St-Shell-Reconnect: a top-centred alert card over the preview (phone: full width).
        <div className="fixed top-[68px] right-3 left-3 z-[93] sm:top-[84px] sm:right-auto sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2">
          <OutputAlertCard message={t("states.reconnectFailed")}>
            <OutputButton
              variant="primary"
              icon="refresh"
              height={isPhone ? 44 : 40}
              onClick={() => {
                if (info) setFrameAttempt((value) => value + 1);
                else setAttempt((value) => value + 1);
              }}
            >
              {t("states.retryConnection")}
            </OutputButton>
            {info && (
              <a
                href={`${info.appOrigin}/login`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] outline-none hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)]"
                style={{ height: isPhone ? 44 : 40 }}
              >
                {t("states.signInSameAccount")}
              </a>
            )}
          </OutputAlertCard>
        </div>
      )}
    </>
  );
}
