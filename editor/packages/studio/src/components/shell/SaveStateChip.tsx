// Save state next to the project title: a chip on desktop, a coloured line under the title on phone.
import { t, useLocale } from "../../i18n/translate";
import type { SaveStatus } from "./saveStatus";
import { ShellIcon } from "./ShellIcon";

const LABEL_KEY = {
  saved: "shell.saved",
  saving: "shell.saving",
  failed: "shell.saveFailed",
} as const;

const CHIP_TONE: Record<SaveStatus, string> = {
  saved: "bg-[var(--st-ok-bg)] text-[var(--st-ok)]",
  saving: "bg-[var(--st-sub)] text-[var(--st-t2)]",
  failed: "bg-[var(--st-danger-bg)] text-[var(--st-danger)]",
};

const TEXT_TONE: Record<SaveStatus, string> = {
  saved: "text-[var(--st-ok)]",
  saving: "text-[var(--st-t2)]",
  failed: "text-[var(--st-danger)]",
};

export function SaveStateChip({ status }: { status: SaveStatus }) {
  useLocale();
  return (
    <span
      role="status"
      data-save-status={status}
      className={`inline-flex h-[26px] flex-none items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-xs font-semibold ${CHIP_TONE[status]}`}
    >
      {status === "saved" && <ShellIcon name="check" size={13} strokeWidth={2.4} />}
      {status === "failed" && <ShellIcon name="warning" size={13} />}
      {status === "saving" && (
        <span
          aria-hidden="true"
          className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      )}
      <span className="max-lg:sr-only">{t(LABEL_KEY[status])}</span>
    </span>
  );
}

export function SaveStateText({ status }: { status: SaveStatus }) {
  useLocale();
  return (
    <span
      role="status"
      data-save-status={status}
      className={`text-[11px] font-semibold leading-[14px] ${TEXT_TONE[status]}`}
    >
      {t(LABEL_KEY[status])}
    </span>
  );
}
