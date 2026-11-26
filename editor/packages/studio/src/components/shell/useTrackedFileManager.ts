// Wraps the file manager so every project write Studio makes shows in the save state.
import { useCallback } from "react";
import type { useFileManager } from "../../hooks/useFileManager";
import { trackProjectSave } from "./saveStatus";

type FileManager = ReturnType<typeof useFileManager>;

export function useTrackedFileManager(fileManager: FileManager): FileManager {
  const { writeProjectFile } = fileManager;
  const trackedWrite = useCallback<FileManager["writeProjectFile"]>(
    (path, content, expectedContent) =>
      trackProjectSave(() => writeProjectFile(path, content, expectedContent)),
    [writeProjectFile],
  );
  return { ...fileManager, writeProjectFile: trackedWrite };
}
