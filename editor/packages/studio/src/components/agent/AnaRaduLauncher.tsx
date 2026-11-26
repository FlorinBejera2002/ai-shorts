// Floating Ana și Radu launcher (St-AgentHello): the round avatar at the bottom right, and a
// greeting bubble that speaks from it once per session. Position comes from the shell's
// --st-launcher-bottom / --st-launcher-right (above the phone tool bar on phone).
import { useState } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { t, useLocale } from "../../i18n/translate";
import { illustrationSrc } from "../ui";
import { AgentIconButton } from "./AgentControls";

const GREETING_MS = 8000;

// The greeting shows once per page session, not again on every remount of the launcher.
let greetedThisSession = false;

/** Test hook: lets a test see the greeting again. */
export function resetLauncherGreeting() {
  greetedThisSession = false;
}

export interface AnaRaduLauncherProps {
  onOpen: () => void;
  phone: boolean;
}

export function AnaRaduLauncher({ onOpen, phone }: AnaRaduLauncherProps) {
  useLocale();
  const [greeting, setGreeting] = useState(!greetedThisSession);
  const size = phone ? 52 : 56;

  useMountEffect(() => {
    if (!greeting) return;
    greetedThisSession = true;
    const timer = window.setTimeout(() => setGreeting(false), GREETING_MS);
    return () => window.clearTimeout(timer);
  });

  return (
    <div
      data-agent-launcher=""
      className="fixed z-[85]"
      style={{
        bottom: "var(--st-launcher-bottom, 28px)",
        right: "var(--st-launcher-right, 28px)",
        width: size,
        height: size,
      }}
    >
      {greeting ? (
        <div
          role="status"
          className="absolute flex items-center gap-0.5 whitespace-nowrap rounded-[20px_20px_6px_20px] bg-[var(--st-sf)] py-2 pl-4 pr-1.5 text-sm font-semibold leading-5 text-[var(--st-tx)]"
          style={{
            right: size + 10,
            bottom: Math.round(size / 2) - 6,
            boxShadow:
              "var(--st-sh), 0 12px 32px rgba(21, 32, 53, 0.16), inset 0 0 0 1px var(--st-bd)",
          }}
        >
          <button type="button" className="text-left" onClick={onOpen}>
            {t("agent.greeting")}
          </button>
          <AgentIconButton
            icon="close"
            size={32}
            iconSize={14}
            label={t("agent.dismissGreeting")}
            onClick={() => setGreeting(false)}
          />
        </div>
      ) : null}
      <button
        type="button"
        aria-label={t("agent.open")}
        title={t("agent.title")}
        onClick={onOpen}
        className="block rounded-full bg-[var(--st-sf)] p-[3px]  transition-transform active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--st-btn)]"
        style={{
          width: size,
          height: size,
          boxShadow: "var(--st-sh), 0 10px 28px rgba(21, 32, 53, 0.22)",
        }}
      >
        <img
          src={illustrationSrc("agent-avatar-duo")}
          alt=""
          className="block h-full w-full rounded-full object-cover"
          draggable={false}
        />
      </button>
    </div>
  );
}
