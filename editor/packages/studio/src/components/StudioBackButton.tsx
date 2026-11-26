import { useState } from "react";
import type { StudioLocale } from "../i18n/dictionary";
import { useMountEffect } from "../hooks/useMountEffect";
import { useEdgeSwipeBack } from "../hooks/useEdgeSwipeBack";
import { t, useLocale } from "../i18n/translate";
import { loadStudioSessionInfo } from "../utils/studioSessionRenewal";
import { ShellIcon } from "./shell/ShellIcon";
import { SHELL_ICON_BUTTON } from "./shell/shellButtons";
import { appClipsUrl, clipsUrlFromReferrer } from "./studioBackTarget";

export { clipsUrlFromReferrer } from "./studioBackTarget";

/**
 * Clips page of the app. On the hosted session the app origin comes from session info, so the
 * link is a real URL in the app's locale. Elsewhere it falls back to the referrer's origin.
 */
function useBackHref(locale: StudioLocale): string | null {
  const [appOrigin, setAppOrigin] = useState<string | null>(null);
  const [referrerHref] = useState(() =>
    clipsUrlFromReferrer(document.referrer, window.location.origin),
  );

  useMountEffect(() => {
    let active = true;
    void loadStudioSessionInfo()
      .then((session) => {
        if (active && session) setAppOrigin(session.appOrigin);
      })
      .catch(() => {
        /* Keep the referrer fallback when session info is unavailable. */
      });
    return () => {
      active = false;
    };
  });

  return appOrigin ? appClipsUrl(appOrigin, locale) : referrerHref;
}

/**
 * Way back to the SneepCut clips page. Desktop shows "‹ Clipuri"; the phone top bar shows a
 * 44px back button, and an edge swipe from the left does the same, as on iOS.
 */
export function StudioBackButton({ variant }: { variant: "desktop" | "phone" }) {
  const locale = useLocale();
  const href = useBackHref(locale);
  useEdgeSwipeBack(
    () => {
      if (href) window.location.assign(href);
    },
    href !== null && variant === "phone",
  );
  if (!href) return null;

  if (variant === "phone") {
    return (
      <a
        href={href}
        aria-label={t("shell.backLabel")}
        title={t("shell.backLabel")}
        className={`${SHELL_ICON_BUTTON} h-11 w-11`}
      >
        <ShellIcon name="back" size={20} />
      </a>
    );
  }
  return (
    <a
      href={href}
      aria-label={t("shell.backLabel")}
      className="inline-flex h-9 flex-none items-center gap-1 rounded-full pl-1 pr-2.5 text-[13px] font-semibold text-[var(--st-t2)] no-underline hover:bg-[var(--st-sub)]"
    >
      <ShellIcon name="back" size={16} />
      <span className="max-lg:sr-only">{t("shell.back")}</span>
    </a>
  );
}
