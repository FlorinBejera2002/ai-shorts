import { useState, type MouseEvent } from "react";
import { useEdgeSwipeBack } from "../hooks/useEdgeSwipeBack";
import { t, useLocale } from "../i18n/translate";
import { ShellIcon } from "./shell/ShellIcon";
import { SHELL_ICON_BUTTON } from "./shell/shellButtons";
import { clipsUrlFromReferrer } from "./studioBackTarget";

export { clipsUrlFromReferrer } from "./studioBackTarget";

interface BackTarget {
  /** The app opened Studio in this tab, so history.back() returns to it. */
  useHistory: boolean;
  href: string | null;
}

function resolveBackTarget(): BackTarget {
  if (typeof document === "undefined") return { useHistory: false, href: null };
  const hosted = document.querySelector('meta[name="sneepcut-session"][content="enabled"]');
  return {
    useHistory: Boolean(hosted) && window.history.length > 1,
    href: clipsUrlFromReferrer(document.referrer, window.location.origin),
  };
}

const goBack = () => window.history.back();

/**
 * Way back to the SneepCut clips page. Desktop shows "‹ Clipuri"; the phone top bar shows a
 * 44px back button, and an edge swipe from the left does the same, as on iOS.
 */
export function StudioBackButton({ variant }: { variant: "desktop" | "phone" }) {
  useLocale();
  const [target] = useState(resolveBackTarget);
  const available = target.useHistory || target.href !== null;
  const swipeBack = () => {
    if (target.useHistory) goBack();
    else if (target.href) window.location.assign(target.href);
  };
  useEdgeSwipeBack(swipeBack, available && variant === "phone");
  if (!available) return null;

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!target.useHistory) return;
    event.preventDefault();
    goBack();
  };

  if (variant === "phone") {
    return (
      <a
        href={target.href ?? "#"}
        onClick={onClick}
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
      href={target.href ?? "#"}
      onClick={onClick}
      aria-label={t("shell.backLabel")}
      className="inline-flex h-9 flex-none items-center gap-1 rounded-full pl-1 pr-2.5 text-[13px] font-semibold text-[var(--st-t2)] no-underline hover:bg-[var(--st-sub)]"
    >
      <ShellIcon name="back" size={16} />
      <span className="max-lg:sr-only">{t("shell.back")}</span>
    </a>
  );
}
