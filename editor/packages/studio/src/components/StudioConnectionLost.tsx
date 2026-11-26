// St-Offline / St-M-Offline: the browser lost its connection. A centred dialog with the offline
// illustration, "Autentifică-te" (when the SneepCut app is known) and "Reconectează".
import { useEffect, useState } from "react";
import { t, useLocale } from "../i18n/translate";
import { OutputButton } from "./output/OutputButton";
import { OutputDialog, OutputIllustration } from "./output/OutputDialog";
import { illustrationSrc } from "./ui/illustrations";
import { useIsPhone } from "./shell/useIsPhone";
import type { ConnectionLostState } from "./useConnectionLost";

export function StudioConnectionLost({
  state,
  loginUrl,
}: {
  state: ConnectionLostState;
  loginUrl: string | null;
}) {
  useLocale();
  const isPhone = useIsPhone();
  const illustration = useOfflineIllustration();
  const height = isPhone ? 48 : 44;
  return (
    <OutputDialog
      open={state.lost}
      title={t("states.offlineTitle")}
      // Closing would leave edits failing silently; the dialog goes away once the server answers.
      onClose={state.reconnect}
      // Phone sheets keep "Închide" (St-M-Offline); desktop closes only through its actions.
      onDone={isPhone ? state.dismiss : undefined}
      canClose={() => false}
      centred
      hideClose={!isPhone}
      doneLabel={t("common.close")}
      width={440}
      role="alertdialog"
      testId="studio-offline"
      footer={
        <>
          {loginUrl ? (
            <OutputButton
              variant="secondary"
              height={height}
              padX={18}
              onClick={() => window.open(loginUrl, "_blank", "noopener")}
            >
              {t("states.offlineSignIn")}
            </OutputButton>
          ) : null}
          <OutputButton
            variant="primary"
            height={height}
            padX={18}
            icon={state.checking ? "refresh" : undefined}
            disabled={state.checking}
            onClick={state.reconnect}
          >
            {state.checking ? t("states.offlineChecking") : t("states.offlineReconnect")}
          </OutputButton>
        </>
      }
    >
      <OutputIllustration src={illustration} size={164} />
    </OutputDialog>
  );
}

/**
 * The illustration as an in-memory URL, fetched while still online: once the connection drops
 * the browser cannot load (or revalidate) it from the server.
 */
function useOfflineIllustration(): string {
  const src = illustrationSrc("studio-offline");
  const [url, setUrl] = useState(src);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetch(src)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  return url;
}
