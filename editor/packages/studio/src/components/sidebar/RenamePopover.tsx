// Rename popover (St-Shell-AssetMenu, St-Shell-CodeMenu): 40px field with a 14px radius, one
// short error line and "Anulează" / "Redenumește". Shared by media assets and code files.
import { useEffect, useRef, useState } from "react";
import { t, useLocale } from "../../i18n/translate";
import { PanelPill } from "./panelKit";

/** Error message key for a name, or null when it is a valid single path segment. */
export function renameError(
  name: string,
): "media.renameInvalidSlash" | "media.renameInvalid" | null {
  if (/[/\\]/.test(name)) return "media.renameInvalidSlash";
  if (name.includes("..")) return "media.renameInvalid";
  return null;
}

export function RenameForm({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  /** Called with a trimmed, valid name that differs from the initial one. */
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  useLocale();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<ReturnType<typeof renameError>>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The popover exists only to edit this name, so the field takes focus when it opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === initial) {
      onCancel();
      return;
    }
    const invalid = renameError(trimmed);
    if (invalid) {
      setError(invalid);
      return;
    }
    onCommit(trimmed);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className={`relative flex h-10 items-center rounded-md bg-studio-surface ${
          error
            ? "shadow-[inset_0_0_0_1.5px_var(--st-danger)]"
            : "shadow-[inset_0_0_0_1.5px_var(--st-sbd)] focus-within:shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
        }`}
      >
        <input
          ref={inputRef}
          value={draft}
          aria-label={t("media.renameLabel")}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          onFocus={(e) => {
            const dot = e.currentTarget.value.lastIndexOf(".");
            e.currentTarget.setSelectionRange(0, dot > 0 ? dot : e.currentTarget.value.length);
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          className="h-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-[13px] text-studio-text outline-none"
        />
      </label>
      {error ? (
        <span role="alert" className="text-xs font-medium text-[var(--st-danger)]">
          {t(error)}
        </span>
      ) : null}
      <div className="flex gap-2">
        <PanelPill size={34} onClick={onCancel}>
          {t("media.cancel")}
        </PanelPill>
        <PanelPill size={34} variant="primary" onClick={commit}>
          {t("media.rename")}
        </PanelPill>
      </div>
    </div>
  );
}

/** Floating card for menus and the rename form: 16px radius, surface, soft shadow. */
export const POPOVER_CLASS =
  "rounded-[16px] bg-studio-surface text-studio-text shadow-[var(--st-sh),0_16px_40px_rgba(21,32,53,.16)]";

/** Menu row: 36px, 8px radius, neutral hover. */
export const MENU_ITEM_CLASS =
  "flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-[13px] font-medium outline-none transition-colors hover:bg-[var(--st-sub)] focus-visible:bg-[var(--st-sub)]";
