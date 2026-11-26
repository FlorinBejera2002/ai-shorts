// Phone bottom tool bar (St-M-Main): Editare, Text, Subtitrări, Audio, Elemente, Mai mult.
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import { ShellIcon, type ShellIconName } from "./ShellIcon";

export type PhoneToolId = "edit" | "text" | "subtitles" | "audio" | "elements" | "more";

const TOOLS: ReadonlyArray<{ id: PhoneToolId; icon: ShellIconName; label: MessageKey }> = [
  { id: "edit", icon: "edit", label: "shell.tabEdit" },
  { id: "text", icon: "text", label: "shell.tabText" },
  { id: "subtitles", icon: "subtitles", label: "shell.tabSubtitles" },
  { id: "audio", icon: "audio", label: "shell.tabAudio" },
  { id: "elements", icon: "elements", label: "shell.tabElements" },
  { id: "more", icon: "more", label: "shell.tabMore" },
];

export const PHONE_TOOL_BAR_H = 88;

export function PhoneToolBar({
  active,
  onSelect,
}: {
  active: PhoneToolId;
  onSelect: (id: PhoneToolId) => void;
}) {
  useLocale();
  return (
    <nav
      aria-label={t("shell.phoneTools")}
      className="flex h-[88px] flex-none items-start gap-0.5 border-t border-studio-border bg-studio-surface px-2 pb-6 pt-2"
    >
      {TOOLS.map((tool) => {
        const selected = tool.id === active;
        return (
          <button
            key={tool.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(tool.id)}
            className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-md text-[11px] font-semibold ${
              selected ? "bg-studio-selected text-studio-on-selected" : "text-[var(--st-t2)]"
            }`}
          >
            <ShellIcon name={tool.icon} size={20} />
            <span className="max-w-full truncate">{t(tool.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
