// Project file tree for Avansat › Cod (St-Shell-Code, St-Shell-CodeEmpty, St-Shell-CodeMenu,
// St-Shell-CodeDelete, St-Shell-CodeFileDelete): "Fișiere" header with new file / new folder,
// the tree, a popover menu, rename popover and delete confirmations with the delete
// illustration. Dropping OS files on a folder imports them there; dragging a row moves it.
import { memo, useState, useCallback, useMemo } from "react";
import {
  buildTree,
  sortChildren,
  ContextMenu,
  type ContextMenuState,
  type InlineInputState,
} from "./FileTreeNodes";
import { t, useLocale } from "../../i18n/translate";
import { PanelIconButton } from "../sidebar/panelKit";
import { FileTreeList } from "./FileTreeList";
import { FileTreeDeleteDialog, FileTreeRenamePopover, type PendingTarget } from "./FileTreeDialogs";
import { useTreeDrag } from "./fileTreeDrag";
import { parentOf } from "./fileTreePaths";

interface FileTreeProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateFolder?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDuplicateFile?: (path: string) => void;
  onMoveFile?: (oldPath: string, newPath: string) => void;
  onImportFiles?: (files: FileList, dir?: string) => void;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
}

/** "Fișiere" title with the root-level new file and new folder buttons. */
function FileTreeHeader({
  onNewFile,
  onNewFolder,
}: {
  onNewFile: () => void;
  onNewFolder: () => void;
}) {
  return (
    <div className="flex min-h-8 flex-none items-center gap-1">
      <span className="flex-1 text-xs font-semibold uppercase tracking-[.04em] text-[var(--st-t2)]">
        {t("code.files")}
      </span>
      <PanelIconButton
        icon="fileNew"
        label={t("code.newFile")}
        className="!h-[30px] !w-[30px]"
        onClick={onNewFile}
      />
      <PanelIconButton
        icon="folderNew"
        label={t("code.newFolder")}
        className="!h-[30px] !w-[30px]"
        onClick={onNewFolder}
      />
    </div>
  );
}

// fallow-ignore-next-line complexity
export const FileTree = memo(function FileTree({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
  onDuplicateFile,
  onMoveFile,
  onImportFiles,
  lintFindingsByFile,
}: FileTreeProps) {
  useLocale();
  const tree = useMemo(() => buildTree(files), [files]);
  const children = useMemo(() => sortChildren(tree.children), [tree]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null);
  const [renameTarget, setRenameTarget] = useState<PendingTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PendingTarget | null>(null);
  const drag = useTreeDrag(onMoveFile, onImportFiles);
  const hasFileOps = !!(
    onCreateFile ||
    onCreateFolder ||
    onDeleteFile ||
    onRenameFile ||
    onDuplicateFile
  );

  const openMenu = useCallback(
    (pos: { x: number; y: number }, path: string, isFolder: boolean) => {
      if (!hasFileOps) return;
      setContextMenu({ x: pos.x, y: pos.y, targetPath: path, targetIsFolder: isFolder });
    },
    [hasFileOps],
  );
  const closeMenu = useCallback(() => setContextMenu(null), []);

  const startCreate = useCallback(
    (parentPath: string, mode: "new-file" | "new-folder") => {
      setInlineInput({
        parentPath,
        mode,
        onCommit: (name: string) => {
          const fullPath = parentPath ? `${parentPath}/${name}` : name;
          if (mode === "new-file") onCreateFile?.(fullPath);
          else onCreateFolder?.(fullPath);
          setInlineInput(null);
        },
        onCancel: () => setInlineInput(null),
      });
    },
    [onCreateFile, onCreateFolder],
  );

  const pendingFrom = (path: string): PendingTarget => ({
    path,
    isFolder: contextMenu?.targetIsFolder ?? false,
    x: contextMenu?.x ?? window.innerWidth / 2,
    y: contextMenu?.y ?? window.innerHeight / 2,
  });

  const commitRename = (name: string) => {
    if (!renameTarget) return;
    const parent = parentOf(renameTarget.path);
    onRenameFile?.(renameTarget.path, parent ? `${parent}/${name}` : name);
    setRenameTarget(null);
  };

  const menuTarget = contextMenu?.targetPath ?? renameTarget?.path ?? deleteTarget?.path ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {hasFileOps && (
        <FileTreeHeader
          onNewFile={() => startCreate("", "new-file")}
          onNewFolder={() => startCreate("", "new-folder")}
        />
      )}

      <FileTreeList
        nodes={children}
        activeFile={activeFile}
        inlineInput={inlineInput}
        menuTarget={menuTarget}
        hasFileOps={hasFileOps}
        drag={drag}
        lintFindingsByFile={lintFindingsByFile}
        onSelectFile={onSelectFile}
        onContextMenu={openMenu}
      />

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={closeMenu}
          onNewFile={(parent) => startCreate(parent, "new-file")}
          onNewFolder={(parent) => startCreate(parent, "new-folder")}
          onRename={(path) => setRenameTarget(pendingFrom(path))}
          onDuplicate={(path) => onDuplicateFile?.(path)}
          onDelete={(path) => setDeleteTarget(pendingFrom(path))}
        />
      )}

      {renameTarget && (
        <FileTreeRenamePopover
          target={renameTarget}
          onCommit={commitRename}
          onCancel={() => setRenameTarget(null)}
        />
      )}

      {deleteTarget && (
        <FileTreeDeleteDialog
          target={deleteTarget}
          onConfirm={() => {
            onDeleteFile?.(deleteTarget.path);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
});
