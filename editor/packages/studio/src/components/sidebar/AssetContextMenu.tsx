import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filename } from "./assetHelpers";
import { DeleteConfirmDialog } from "./PanelDialog";
import { MENU_ITEM_CLASS, POPOVER_CLASS, RenameForm } from "./RenamePopover";
import { PanelIcon, type PanelIconName } from "./panelIcons";
import { t, useLocale } from "../../i18n/translate";

interface MenuAction {
  id: string;
  icon: PanelIconName;
  label: string;
  danger?: boolean;
  run: () => void;
}

/** Keeps a floating box inside the viewport once it has a size. */
function useClampedPosition(x: number, y: number, deps: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    setPos({
      x: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    });
  }, [x, y, deps]);
  return { ref, pos };
}

/** Asset actions: add at playhead, copy path, rename (popover) and delete (confirm dialog). */
// fallow-ignore-next-line complexity
export function ContextMenu({
  x,
  y,
  asset,
  onClose,
  onCopy,
  onDelete,
  onRename,
  onAddAtPlayhead,
}: {
  x: number;
  y: number;
  asset: string;
  onClose: () => void;
  onCopy: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAtPlayhead?: (path: string) => void;
}) {
  useLocale();
  const [mode, setMode] = useState<"menu" | "confirm-delete" | "rename">("menu");
  const { ref: menuRef, pos } = useClampedPosition(x, y, mode);
  const name = filename(asset);

  const closeMenu = useEffectEvent(onClose);

  // Escape backs out one level (rename -> menu -> closed); arrows move between items.
  useEffect(() => {
    if (mode === "confirm-delete") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (mode === "menu") closeMenu();
        else setMode("menu");
        return;
      }
      if (mode !== "menu" || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.findIndex((el) => el === document.activeElement);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      items[(idx + delta + items.length) % items.length]?.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mode, menuRef]);

  useEffect(() => {
    if (mode === "menu") {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [mode, menuRef]);

  if (mode === "confirm-delete") {
    return (
      <DeleteConfirmDialog
        title={t("media.deleteTitle", { name })}
        message={name}
        phoneTitle={t("code.deleteFile")}
        phoneMessage={t("code.deleteFileMessage", { name })}
        onConfirm={() => {
          onDelete?.(asset);
          onClose();
        }}
        onCancel={onClose}
      />
    );
  }

  const actions: MenuAction[] = [];
  if (onAddAtPlayhead) {
    actions.push({
      id: "add",
      icon: "addAtPlayhead",
      label: t("media.addAtPlayhead"),
      run: () => {
        onAddAtPlayhead(asset);
        onClose();
      },
    });
  }
  actions.push({
    id: "copy",
    icon: "copy",
    label: t("media.copyPath"),
    run: () => {
      onCopy(asset);
      onClose();
    },
  });
  if (onRename) {
    actions.push({
      id: "rename",
      icon: "pencil",
      label: t("media.rename"),
      run: () => setMode("rename"),
    });
  }
  if (onDelete) {
    actions.push({
      id: "delete",
      icon: "trash",
      label: t("common.delete"),
      danger: true,
      run: () => setMode("confirm-delete"),
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role={mode === "menu" ? "menu" : "dialog"}
        aria-label={mode === "menu" ? t("media.menuLabel", { name }) : t("media.rename")}
        className={`absolute ${POPOVER_CLASS} ${mode === "menu" ? "min-w-[200px] p-1.5" : "w-[290px] p-3"}`}
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "menu" ? (
          actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              onClick={action.run}
              className={`${MENU_ITEM_CLASS} ${action.danger ? "text-[var(--st-danger)]" : ""}`}
            >
              <PanelIcon name={action.icon} />
              {action.label}
            </button>
          ))
        ) : (
          <RenameForm
            initial={name}
            onCancel={() => setMode("menu")}
            onCommit={(next) => {
              const dir = asset.includes("/") ? asset.slice(0, asset.lastIndexOf("/") + 1) : "";
              onRename?.(asset, `${dir}${next}`);
              onClose();
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
