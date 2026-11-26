// "Editor sursă" card for Avansat › Cod (St-Shell-Code, St-Shell-CodeEmpty,
// St-Shell-CodeLoading, St-Shell-FileError). On desktop the card covers the preview and
// inspector columns, as on the boards: it is portalled into the shell's card row and placed
// from the preview column's left edge to the row's right edge. The preview stays mounted
// underneath, so leaving the Cod tab shows it again without a reload. On phone it renders inline.
import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t, useLocale } from "../../i18n/translate";
import { useIsPhone } from "../shell/useIsPhone";

interface Placement {
  row: HTMLElement;
  left: number;
}

/** Finds the shell's card row and the preview column next to the side panel. */
function findPlacement(panel: HTMLElement | null): Placement | null {
  const wrapper = panel?.closest<HTMLElement>("[data-left-sidebar]");
  const row = wrapper?.parentElement;
  if (!wrapper || !row) return null;
  let next = wrapper.nextElementSibling as HTMLElement | null;
  while (
    next &&
    (next.hasAttribute("data-shell-resize") || next.getAttribute("aria-hidden") === "true")
  ) {
    next = next.nextElementSibling as HTMLElement | null;
  }
  if (!next) return null;
  return { row, left: next.offsetLeft };
}

function usePlacement(anchor: HTMLElement | null, enabled: boolean): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    if (!enabled || !anchor) {
      setPlacement(null);
      return;
    }
    const update = () => {
      const next = findPlacement(anchor);
      setPlacement((prev) =>
        prev && next && prev.row === next.row && prev.left === next.left ? prev : next,
      );
    };
    update();
    // The anchor is display:contents and never reports a size, and the row keeps its size
    // while the panel is resized. Watch the side panel wrapper (its width follows the resize
    // handle) and the columns after it, whose offsets place the card.
    const observer = new ResizeObserver(update);
    const wrapper = anchor.closest<HTMLElement>("[data-left-sidebar]");
    if (wrapper) {
      observer.observe(wrapper);
      for (let el = wrapper.nextElementSibling; el; el = el.nextElementSibling) {
        observer.observe(el);
      }
    }
    if (wrapper?.parentElement) observer.observe(wrapper.parentElement);
    return () => observer.disconnect();
  }, [anchor, enabled]);
  return placement;
}

export interface CodeEditorCardProps {
  /** Side panel element, used to locate the shell row. */
  anchor: HTMLElement | null;
  path: string | null;
  state: "empty" | "loading" | "binary" | "editor";
  editor?: ReactNode;
}

function CardBody({ path, state, editor }: Omit<CodeEditorCardProps, "anchor">) {
  if (state === "empty") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <b className="text-sm font-semibold text-[var(--st-t2)]">{t("code.selectFile")}</b>
      </div>
    );
  }
  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <b role="status" className="text-sm font-semibold text-[var(--st-t2)]">
          {t("code.loadingFile", { path: path ?? "" })}
        </b>
      </div>
    );
  }
  return (
    <>
      <div className="flex min-h-8 flex-none items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">{path}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md bg-[var(--st-in)] shadow-[inset_0_0_0_1px_var(--st-bd)]">
        {state === "binary" ? (
          <div className="px-3.5 py-3 text-[13px] font-medium text-[var(--st-t2)]">
            {t("code.cantShow")}
          </div>
        ) : (
          editor
        )}
      </div>
    </>
  );
}

export function CodeEditorCard({ anchor, path, state, editor }: CodeEditorCardProps) {
  useLocale();
  const isPhone = useIsPhone();
  const placement = usePlacement(anchor, !isPhone);
  const card = (
    <section
      aria-label={t("code.editor")}
      data-code-editor-card=""
      className={`flex min-h-0 flex-col gap-2.5 overflow-hidden text-studio-text ${
        isPhone ? "h-[50vh] flex-none" : "h-full rounded-card bg-studio-surface p-4 shadow-studio"
      }`}
    >
      <CardBody path={path} state={state} editor={editor} />
    </section>
  );
  if (isPhone) return card;
  if (!placement) return null;
  return createPortal(
    <div className="absolute bottom-[9px] right-0 top-3 z-[60]" style={{ left: placement.left }}>
      {card}
    </div>,
    placement.row,
  );
}
