// Rename popover and delete confirmation for the project file tree.
import { createPortal } from "react-dom";
import { t } from "../../i18n/translate";
import { DeleteConfirmDialog } from "../sidebar/PanelDialog";
import { POPOVER_CLASS, RenameForm } from "../sidebar/RenamePopover";
import { leafName } from "./fileTreePaths";

/** A row the user opened a rename or delete action on, with the anchor for its popover. */
export interface PendingTarget {
  path: string;
  isFolder: boolean;
  x: number;
  y: number;
}

export function FileTreeRenamePopover({
  target,
  onCommit,
  onCancel,
}: {
  target: PendingTarget;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[200]" role="presentation" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-label={t("code.rename")}
        className={`absolute w-[280px] p-3 ${POPOVER_CLASS}`}
        style={{
          left: Math.min(target.x, window.innerWidth - 296),
          top: Math.min(target.y, window.innerHeight - 160),
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <RenameForm initial={leafName(target.path)} onCancel={onCancel} onCommit={onCommit} />
      </div>
    </div>,
    document.body,
  );
}

export function FileTreeDeleteDialog({
  target,
  onConfirm,
  onCancel,
}: {
  target: PendingTarget;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const name = leafName(target.path);
  return (
    <DeleteConfirmDialog
      title={target.isFolder ? t("code.deleteFolder") : t("code.deleteFile")}
      message={
        target.isFolder
          ? t("code.deleteFolderMessage", { name })
          : t("code.deleteFileMessage", { name })
      }
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
