// Font picker parts (St-Inspector-Font): the source badges (Google, Local, Sistem, Importat)
// and the "Importă fișiere de font locale" action.
import { t } from "../../i18n/translate";

// Re-exported so existing imports from this module keep resolving.
export { fontSourceLabel } from "./fontSourceLabel";

export function ImportFontsButton({
  disabled,
  busy,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-full flex-none items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
      </svg>
      {busy ? "…" : t("font.importLocal")}
    </button>
  );
}
