import { useState, useCallback, useRef } from "react";
import { leafName } from "./fileTreePaths";

/** Drag-to-move and OS-file drop handling for the tree. */
export function useTreeDrag(
  onMoveFile?: (oldPath: string, newPath: string) => void,
  onImportFiles?: (files: FileList, dir?: string) => void,
) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, path: string) => {
    dragSourceRef.current = path;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", path);
  }, []);
  const onDragOver = useCallback((_e: React.DragEvent, folderPath: string) => {
    setDragOverFolder(folderPath);
  }, []);
  const onDragLeave = useCallback(() => setDragOverFolder(null), []);
  const onDrop = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      const sourcePath = dragSourceRef.current;
      dragSourceRef.current = null;
      setDragOverFolder(null);
      if (e.dataTransfer.files.length > 0 && !sourcePath) {
        e.preventDefault();
        onImportFiles?.(e.dataTransfer.files, folderPath || undefined);
        return;
      }
      if (!sourcePath || !onMoveFile) return;
      const newPath = folderPath ? `${folderPath}/${leafName(sourcePath)}` : leafName(sourcePath);
      if (newPath !== sourcePath && !folderPath.startsWith(sourcePath + "/")) {
        onMoveFile(sourcePath, newPath);
      }
    },
    [onMoveFile, onImportFiles],
  );
  return { dragOverFolder, setDragOverFolder, onDragStart, onDragOver, onDragLeave, onDrop };
}

export type TreeDrag = ReturnType<typeof useTreeDrag>;
