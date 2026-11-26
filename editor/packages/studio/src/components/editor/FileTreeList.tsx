// The project file tree body: the rows (files and folders), the root drop target and the
// root-level inline input. Dropping OS files on it imports them at the root; dragging a row
// onto it moves the row there.
import { memo } from "react";
import { InlineInput, TreeFile, TreeFolder, type InlineInputState } from "./FileTreeNodes";
import { isActiveInSubtree, type TreeNode } from "./FileTreeIcons";
import { t } from "../../i18n/translate";
import type { TreeDrag } from "./fileTreeDrag";

interface FileTreeListProps {
  nodes: TreeNode[];
  activeFile: string | null;
  inlineInput: InlineInputState | null;
  menuTarget: string | null;
  hasFileOps: boolean;
  drag: TreeDrag;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
  onSelectFile: (path: string) => void;
  onContextMenu: (pos: { x: number; y: number }, path: string, isFolder: boolean) => void;
}

/** Root-level create input, shown only while creating at the top of the tree. */
function rootInputFor(inlineInput: InlineInputState | null): InlineInputState | null {
  return inlineInput && inlineInput.mode !== "rename" && inlineInput.parentPath === ""
    ? inlineInput
    : null;
}

export const FileTreeList = memo(function FileTreeList({
  nodes,
  activeFile,
  inlineInput,
  menuTarget,
  hasFileOps,
  drag,
  lintFindingsByFile,
  onSelectFile,
  onContextMenu,
}: FileTreeListProps) {
  const rootInput = rootInputFor(inlineInput);
  const rowProps = {
    activeFile,
    onSelectFile,
    onContextMenu,
    inlineInput,
    onDragStart: drag.onDragStart,
  };

  return (
    <div
      role="tree"
      aria-label={t("code.tree")}
      className={`flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-[10px] ${
        drag.dragOverFolder === "" ? "shadow-[inset_0_0_0_1.5px_var(--st-tx)]" : ""
      }`}
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget || !hasFileOps) return;
        e.preventDefault();
        onContextMenu({ x: e.clientX, y: e.clientY }, "", true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.target === e.currentTarget) drag.setDragOverFolder("");
      }}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) drag.setDragOverFolder(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop(e, "");
      }}
    >
      {rootInput && (
        <InlineInput
          defaultValue=""
          depth={0}
          isFolder={rootInput.mode === "new-folder"}
          onCommit={(name) => rootInput.onCommit?.(name)}
          onCancel={() => rootInput.onCancel?.()}
        />
      )}
      {nodes.length === 0 && !inlineInput && (
        <span className="px-2 py-4 text-center text-[13px] font-medium text-[var(--st-t2)]">
          {t("code.empty")}
        </span>
      )}
      {nodes.map((child) =>
        child.isFile && child.children.size === 0 ? (
          <TreeFile
            key={child.fullPath}
            node={child}
            depth={0}
            {...rowProps}
            lintInfo={lintFindingsByFile?.get(child.fullPath)}
          />
        ) : (
          <TreeFolder
            key={child.fullPath}
            node={child}
            depth={0}
            {...rowProps}
            defaultOpen={isActiveInSubtree(child, activeFile)}
            onDragOver={drag.onDragOver}
            onDrop={drag.onDrop}
            onDragLeave={drag.onDragLeave}
            dragOverFolder={drag.dragOverFolder}
            lintFindingsByFile={lintFindingsByFile}
            menuTarget={menuTarget}
          />
        ),
      )}
    </div>
  );
});
