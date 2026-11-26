// Editable project title. Enter or blur saves a 1–120 character title; Escape restores it.
import { useState } from "react";
import { t, useLocale } from "../../i18n/translate";
import { PROJECT_TITLE_MAX } from "./useProjectTitle";

export interface ProjectTitleFieldProps {
  title: string;
  onCommit: (value: string) => string | null;
  onInvalid?: () => void;
  className?: string;
}

export function ProjectTitleField({
  title,
  onCommit,
  onInvalid,
  className = "",
}: ProjectTitleFieldProps) {
  useLocale();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? title;

  const commit = () => {
    if (draft === null) return;
    if (draft.trim() !== title && onCommit(draft) === null) onInvalid?.();
    setDraft(null);
  };

  return (
    <input
      aria-label={t("shell.projectTitle")}
      title={value}
      value={value}
      maxLength={PROJECT_TITLE_MAX}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          const input = event.currentTarget;
          setDraft(null);
          requestAnimationFrame(() => input.blur());
        }
        // Keep editor hotkeys (Delete, Space, undo…) away from the title while typing.
        event.stopPropagation();
      }}
      className={`min-w-0 truncate rounded-[10px] border-0 bg-transparent font-display font-semibold text-studio-text outline-none hover:bg-[var(--st-sub)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--st-tx)] ${className}`}
    />
  );
}
