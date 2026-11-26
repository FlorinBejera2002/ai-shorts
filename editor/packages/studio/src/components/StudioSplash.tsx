// Opening splash (St-Opening): a 360px card on the Studio canvas with the logo, the Ana și Radu
// opening illustration, "Se deschide Studio…" and an indeterminate progress bar. While the
// preview server is not up yet the title says so instead.
import { t, useLocale } from "../i18n/translate";
import { illustrationSrc } from "./ui/illustrations";

export function StudioSplash({ waiting }: { waiting?: boolean }) {
  useLocale();
  const title = waiting ? t("states.waitingServer") : t("states.opening");
  return (
    <div
      data-studio-splash
      className="flex h-full w-full items-center justify-center bg-studio-bg p-4 text-studio-text"
    >
      <div
        role="status"
        aria-label={title}
        className="flex w-[360px] max-w-full flex-col items-center gap-5 rounded-[28px] bg-studio-surface px-7 py-8 shadow-[var(--st-sh),inset_0_0_0_1px_var(--st-bd)]"
      >
        <img
          src="/sneepcut-logo-color.svg"
          alt="Sneep Cut"
          className="block h-5 w-auto [[data-theme=dark]_&]:hidden"
        />
        <img
          src="/sneepcut-logo.svg"
          alt="Sneep Cut"
          className="hidden h-5 w-auto [[data-theme=dark]_&]:block"
        />
        <img
          src={illustrationSrc("studio-opening")}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-[200px] w-[200px] object-contain"
        />
        <b className="text-center font-display text-xl font-semibold leading-7 [text-wrap:balance]">
          {title}
        </b>
        <span
          aria-hidden="true"
          className="relative block h-1.5 w-60 max-w-full overflow-hidden rounded-full bg-[var(--st-hd)]"
        >
          <span className="hf-splash-progress absolute inset-y-0 left-0 w-2/5 rounded-full bg-studio-text motion-reduce:animate-none" />
        </span>
      </div>
      <style>{`@keyframes hf-splash-progress{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}.hf-splash-progress{animation:hf-splash-progress 1.4s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.hf-splash-progress{animation:none;transform:none}}`}</style>
    </div>
  );
}
