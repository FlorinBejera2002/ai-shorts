// "Mai mult" sheet on phone (St-M-Shell-PhoneMenu): the six canvas formats as a 3×2 grid,
// then rows for the panels that have no tool bar button.
import type { MessageKey } from "../../i18n/dictionary";
import { t, useLocale } from "../../i18n/translate";
import type { AgentRecordEdit } from "../agent/useAgentRun";
import { CANVAS_FORMATS, canvasFormatLabel, useCanvasAspect } from "../CanvasAspectSelect";
import { PhoneSheet } from "./PhoneSheet";
import { ShellIcon, type ShellIconName } from "./ShellIcon";

export interface PhoneMoreRow {
  id: string;
  icon: ShellIconName;
  label: MessageKey;
  count?: number;
  onSelect: () => void;
}

export interface PhoneMoreSheetProps {
  open: boolean;
  onClose: () => void;
  recordEdit?: AgentRecordEdit;
  rows: readonly PhoneMoreRow[];
}

function FormatGrid({ recordEdit, onDone }: { recordEdit: AgentRecordEdit; onDone: () => void }) {
  const aspect = useCanvasAspect(recordEdit);
  const current = aspect.value || "Original";
  return (
    <div role="radiogroup" aria-label={t("shell.format")} className="grid grid-cols-3 gap-2">
      {CANVAS_FORMATS.map((format) => {
        const selected = format === current;
        return (
          <button
            key={format}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={aspect.disabled}
            onClick={() => {
              if (selected) return;
              onDone();
              void aspect.change(format);
            }}
            className={`h-10 max-sm:h-11 rounded-full text-[13px] font-semibold ${
              selected
                ? "bg-studio-selected text-studio-on-selected"
                : "text-studio-text shadow-[inset_0_0_0_1.5px_var(--st-sbd)]"
            }`}
          >
            {canvasFormatLabel(format)}
          </button>
        );
      })}
    </div>
  );
}

export function PhoneMoreSheet({ open, onClose, recordEdit, rows }: PhoneMoreSheetProps) {
  useLocale();
  return (
    <PhoneSheet open={open} onClose={onClose} title={t("shell.more")} closeLabel={t("shell.close")}>
      <div className="flex flex-col gap-2.5 px-4 pb-2">
        {recordEdit && <FormatGrid recordEdit={recordEdit} onDone={onClose} />}
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              onClose();
              row.onSelect();
            }}
            className="flex h-[52px] items-center gap-3 rounded-md bg-studio-surface px-4 text-left text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1px_var(--st-bd)]"
          >
            <ShellIcon name={row.icon} size={18} />
            <span className="min-w-0 flex-1 truncate">{t(row.label)}</span>
            {row.count ? (
              <span className="min-w-6 rounded-sm bg-[var(--st-warn-bg)] px-1.5 text-center text-[11px] font-semibold leading-5 text-[var(--st-warn-text)]">
                {row.count}
              </span>
            ) : (
              <ShellIcon name="chevronRight" size={16} />
            )}
          </button>
        ))}
      </div>
    </PhoneSheet>
  );
}
