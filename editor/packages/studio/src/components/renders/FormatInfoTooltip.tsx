import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveFloatingPanelPosition, type FloatingPosition } from "../editor/floatingPanel";
import { useLocale, t } from "../../i18n/translate";
import { OutputIcon } from "../output/OutputIcon";
import { FORMAT_LABEL, formatDescription, type RenderFormat } from "./formatInfo";

// Estimated: only the flip decision uses the height, and the clamp keeps the panel on screen.
const FORMAT_PANEL_SIZE = { width: 300, height: 230 };
const FORMATS: RenderFormat[] = ["mp4", "mov", "webm"];

/**
 * "Despre formatele video" (St-Output-FormatInfo): a 28px info button beside the Format label
 * that opens a 300px popover listing each format with one line, the current one checked.
 * The trigger is a real button tied to the panel with aria-describedby; Escape dismisses
 * (WCAG 1.4.13). It renders in a portal because the inspector card clips overflow.
 */
export function FormatInfoTooltip({ format }: { format: RenderFormat }) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const panelId = useId();

  const show = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const hide = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    setPosition(
      resolveFloatingPanelPosition(
        el.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        FORMAT_PANEL_SIZE,
        { offset: 6 },
      ),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div ref={triggerRef} className="relative" onPointerEnter={show} onPointerLeave={hide}>
      <button
        type="button"
        aria-label={t("output.aboutFormats")}
        title={t("output.aboutFormats")}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
          open
            ? "bg-[var(--st-sel)] text-[var(--st-on-sel)]"
            : "text-studio-text hover:bg-[var(--st-sub)]"
        }`}
      >
        <OutputIcon name="info" size={14} />
      </button>
      {open &&
        createPortal(
          <div
            id={panelId}
            role="tooltip"
            onPointerEnter={show}
            onPointerLeave={hide}
            className="fixed z-[200] flex w-[300px] flex-col gap-3 rounded-[20px] bg-studio-surface p-4 text-studio-text shadow-[var(--st-sh),0_16px_40px_rgba(21,32,53,0.16)]"
            style={{ left: position?.left ?? -9999, top: position?.top ?? -9999 }}
          >
            <b className="text-[13px] font-semibold">{t("output.aboutFormats")}</b>
            <div className="flex flex-col gap-0.5">
              {FORMATS.map((f) => (
                <div
                  key={f}
                  className={`flex min-h-[52px] items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 ${
                    f === format ? "bg-[var(--st-sub)]" : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <b className={`text-[13px] ${f === format ? "font-semibold" : "font-medium"}`}>
                      {FORMAT_LABEL[f]}
                    </b>
                    <span className="text-[11px] leading-[15px] text-[var(--st-t2)]">
                      {formatDescription(f)}
                    </span>
                  </span>
                  {f === format ? <OutputIcon name="check" size={14} strokeWidth={2.4} /> : null}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
