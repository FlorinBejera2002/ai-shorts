// File tree rows and menus for the Avansat › Cod panel (St-Shell-Code, St-Shell-CodeMenu):
// 32px rows with a 10px radius, folders in semibold with a chevron, the selected file filled
// with the selected token, lint counts as warning tags, and a popover menu.
import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  buildTree as _buildTree,
  sortChildren,
  isActiveInSubtree,
  type TreeNode,
  type ContextMenuState,
  type InlineInputState,
} from "./FileTreeIcons";
import { t, useLocale } from "../../i18n/translate";
import { PanelIcon, type PanelIconName } from "../sidebar/panelIcons";
import { CountBadge } from "../sidebar/panelKit";
import { MENU_ITEM_CLASS, POPOVER_CLASS, renameError } from "../sidebar/RenamePopover";

export type { ContextMenuState, InlineInputState };
export { buildTree, sortChildren, isActiveInSubtree } from "./FileTreeIcons";
void _buildTree;

const FILE_PAD = 26;
const FOLDER_PAD = 8;
const DEPTH_STEP = 14;

function lintLabel(count: number): string {
  return count === 1 ? t("code.lintCountOne") : t("code.lintCount", { n: count });
}

// ── Context menu ──

export function ContextMenu({
  state,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDuplicate,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  useLocale();
  const menuRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      restore?.focus();
    };
  }, [onClose]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll("button") ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    else if (e.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    else if (e.key === "End") next = items.length - 1;
    items[next]?.focus();
  };

  const parentPath = state.targetIsFolder
    ? state.targetPath
    : state.targetPath.includes("/")
      ? state.targetPath.slice(0, state.targetPath.lastIndexOf("/"))
      : "";
  const isRoot = state.targetPath === "";
  const item = (icon: PanelIconName, label: string, run: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={`${MENU_ITEM_CLASS} ${danger ? "text-[var(--st-danger)]" : ""}`}
      onClick={() => {
        run();
        onClose();
      }}
    >
      <PanelIcon name={icon} />
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleMenuKeyDown}
      className={`fixed z-[200] flex min-w-[200px] flex-col p-1.5 ${POPOVER_CLASS}`}
      style={{
        left: Math.min(state.x, window.innerWidth - 216),
        top: Math.min(state.y, window.innerHeight - 220),
      }}
    >
      {item("fileNew", t("code.newFile"), () => onNewFile(parentPath))}
      {state.targetIsFolder
        ? item("folderNew", t("code.newFolder"), () => onNewFolder(parentPath))
        : null}
      {!isRoot ? item("pencil", t("code.rename"), () => onRename(state.targetPath)) : null}
      {!isRoot && !state.targetIsFolder
        ? item("copy", t("code.duplicate"), () => onDuplicate(state.targetPath))
        : null}
      {!isRoot ? item("trash", t("common.delete"), () => onDelete(state.targetPath), true) : null}
    </div>
  );
}

// ── Inline input (new file / new folder) ──

export function InlineInput({
  defaultValue,
  depth,
  isFolder,
  onCommit,
  onCancel,
}: {
  defaultValue: string;
  depth: number;
  isFolder: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<ReturnType<typeof renameError>>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const dot = defaultValue.lastIndexOf(".");
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, [defaultValue]);

  const commit = (name: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) {
        onCancel();
        return;
      }
      const invalid = renameError(trimmed);
      if (invalid) {
        setError(invalid);
        return;
      }
      commit(trimmed);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== defaultValue && !renameError(trimmed)) commit(trimmed);
    else onCancel();
  };

  return (
    <div
      className="flex min-h-8 items-start gap-2 py-0.5 pr-2"
      style={{ paddingLeft: (isFolder ? FOLDER_PAD : FILE_PAD) + depth * DEPTH_STEP }}
    >
      <span className="mt-2 flex text-[var(--st-t2)]">
        <PanelIcon name={isFolder ? "folder" : "file"} />
      </span>
      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          value={value}
          aria-label={isFolder ? t("code.newFolder") : t("code.newFile")}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          className={`h-8 w-full min-w-0 rounded-sm bg-studio-surface px-2.5 text-[13px] text-studio-text outline-none ${
            error
              ? "shadow-[inset_0_0_0_1.5px_var(--st-danger)]"
              : "shadow-[inset_0_0_0_1.5px_var(--st-sbd)] focus:shadow-[inset_0_0_0_1.5px_var(--st-tx)]"
          }`}
        />
        {error ? (
          <div role="alert" className="mt-1 text-xs font-medium text-[var(--st-danger)]">
            {t(error)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Rows ──

const ROW_CLASS =
  "flex h-8 w-full min-w-0 items-center gap-2 rounded-[10px] pr-2 text-left text-[13px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--st-btn)]";

interface RowCallbacks {
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onContextMenu: (pos: { x: number; y: number }, path: string, isFolder: boolean) => void;
  inlineInput: InlineInputState | null;
  onDragStart: (e: React.DragEvent, path: string) => void;
}

export const TreeFile = memo(function TreeFile({
  node,
  depth,
  activeFile,
  onSelectFile,
  onContextMenu,
  onDragStart,
  lintInfo,
}: RowCallbacks & {
  node: TreeNode;
  depth: number;
  lintInfo?: { count: number; messages: string[] };
}) {
  const isActive = node.fullPath === activeFile;
  return (
    <button
      type="button"
      role="treeitem"
      aria-selected={isActive}
      data-tree-path={node.fullPath}
      draggable
      onDragStart={(e) => onDragStart(e, node.fullPath)}
      onClick={() => onSelectFile(node.fullPath)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY }, node.fullPath, false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onContextMenu({ x: r.left + 24, y: r.bottom }, node.fullPath, false);
        }
      }}
      className={`${ROW_CLASS} font-medium ${
        isActive
          ? "bg-studio-selected text-studio-on-selected"
          : "text-studio-text hover:bg-[var(--st-sub)]"
      }`}
      style={{ paddingLeft: FILE_PAD + depth * DEPTH_STEP }}
    >
      <PanelIcon name="file" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {lintInfo && lintInfo.count > 0 ? (
        <span title={lintInfo.messages.join("\n")} className="flex">
          <CountBadge count={lintInfo.count} label={lintLabel(lintInfo.count)} />
        </span>
      ) : null}
    </button>
  );
});

export const TreeFolder = memo(function TreeFolder({
  node,
  depth,
  activeFile,
  onSelectFile,
  defaultOpen,
  onContextMenu,
  inlineInput,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  dragOverFolder,
  lintFindingsByFile,
  menuTarget,
}: RowCallbacks & {
  node: TreeNode;
  depth: number;
  defaultOpen: boolean;
  onDragOver: (e: React.DragEvent, folderPath: string) => void;
  onDrop: (e: React.DragEvent, folderPath: string) => void;
  onDragLeave: () => void;
  dragOverFolder: string | null;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
  menuTarget?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const children = useMemo(() => sortChildren(node.children), [node.children]);
  const highlighted = dragOverFolder === node.fullPath || menuTarget === node.fullPath;
  const shared = { activeFile, onSelectFile, onContextMenu, inlineInput, onDragStart };

  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isOpen}
        data-tree-path={node.fullPath}
        draggable
        onDragStart={(e) => onDragStart(e, node.fullPath)}
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu({ x: e.clientX, y: e.clientY }, node.fullPath, true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(e, node.fullPath);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(e, node.fullPath);
        }}
        onDragLeave={onDragLeave}
        className={`${ROW_CLASS} font-semibold ${
          highlighted
            ? "bg-studio-selected text-studio-on-selected"
            : "text-studio-text hover:bg-[var(--st-sub)]"
        }`}
        style={{ paddingLeft: FOLDER_PAD + depth * DEPTH_STEP }}
      >
        <PanelIcon name={isOpen ? "chevronDown" : "chevronRight"} size={14} />
        <PanelIcon name="folder" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      {isOpen && (
        <div role="group" className="flex flex-col gap-0.5">
          {inlineInput &&
            (inlineInput.mode === "new-file" || inlineInput.mode === "new-folder") &&
            inlineInput.parentPath === node.fullPath && (
              <InlineInput
                defaultValue=""
                depth={depth + 1}
                isFolder={inlineInput.mode === "new-folder"}
                onCommit={(name) => inlineInput.onCommit?.(name)}
                onCancel={() => inlineInput.onCancel?.()}
              />
            )}
          {children.map((child) =>
            child.children.size > 0 ? (
              <TreeFolder
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                {...shared}
                defaultOpen={isActiveInSubtree(child, activeFile)}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragLeave={onDragLeave}
                dragOverFolder={dragOverFolder}
                lintFindingsByFile={lintFindingsByFile}
                menuTarget={menuTarget}
              />
            ) : (
              <TreeFile
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                {...shared}
                lintInfo={lintFindingsByFile?.get(child.fullPath)}
              />
            ),
          )}
        </div>
      )}
    </>
  );
});
