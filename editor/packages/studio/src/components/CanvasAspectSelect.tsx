import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../i18n/translate";
import { COMPOSITION_ASPECTS } from "../utils/compositionAspectRatio";
import { canvasFormatLabel, CANVAS_FORMATS, useCanvasAspect } from "./canvasAspect";
import type { AgentRecordEdit } from "./agent/useAgentRun";
import { ShellIcon, type ShellIconName } from "./shell/ShellIcon";
import { useDismissOnOutside } from "./shell/useDismissOnOutside";

export { CANVAS_FORMATS, canvasFormatLabel, useCanvasAspect } from "./canvasAspect";

function formatIcon(format: string): ShellIconName {
  const preset = COMPOSITION_ASPECTS.find((aspect) => aspect.label === format);
  if (!preset || preset.width === preset.height) return "square";
  return preset.width > preset.height ? "landscape" : "phone";
}

/** Top bar format menu: 124×40 trigger and a six-item menu under it. */
export function CanvasAspectSelect({ recordEdit }: { recordEdit: AgentRecordEdit }) {
  useLocale();
  const aspect = useCanvasAspect(recordEdit);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, [triggerRef, menuRef], close);
  const current = aspect.value || "Original";
  const rect = open ? triggerRef.current?.getBoundingClientRect() : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("shell.format")}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={aspect.disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-[124px] flex-none max-lg:w-[96px] max-lg:pl-3 items-center gap-2 rounded-md bg-studio-surface pl-3.5 pr-3 text-[13px] font-semibold text-studio-text shadow-[inset_0_0_0_1px_var(--st-sbd)] hover:bg-[var(--st-sub)] disabled:opacity-60"
      >
        <ShellIcon name={formatIcon(current)} size={15} />
        <span className="flex-1 text-center">{canvasFormatLabel(current)}</span>
        <ShellIcon name="chevronDown" size={14} />
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t("shell.format")}
            style={{ left: Math.max(8, rect.left - 160), top: rect.bottom + 8 }}
            className="fixed z-[120] flex w-[124px] flex-col gap-0.5 rounded-[16px] bg-studio-surface p-1.5 shadow-studio"
          >
            {CANVAS_FORMATS.map((format) => {
              const selected = format === current;
              return (
                <button
                  key={format}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setOpen(false);
                    if (!selected) void aspect.change(format);
                  }}
                  className={`flex h-9 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-2.5 text-left text-[13px] font-medium text-studio-text hover:bg-[var(--st-sub)] ${selected ? "bg-[var(--st-sub)]" : ""}`}
                >
                  {selected && <ShellIcon name="check" size={14} strokeWidth={2.4} />}
                  <span className="flex-1">{canvasFormatLabel(format)}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
