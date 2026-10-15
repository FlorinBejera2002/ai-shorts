import { useEffect, useState } from "react";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { useStudioShellContext } from "../contexts/StudioContext";

export function SourceImportNotice() {
  const { readOptionalProjectFile } = useFileManagerContext();
  const { projectId, activeCompPath, setActiveCompPath } = useStudioShellContext();
  const [notes, setNotes] = useState("");
  useEffect(() => {
    let cancelled = false;
    void readOptionalProjectFile("import-notes.txt")
      .then((text) => {
        if (!cancelled) setNotes(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, readOptionalProjectFile]);
  if (!notes) return null;
  const original = activeCompPath === "original-export.html";
  return (
    <details className="shrink-0 border-b border-neutral-800 px-3 py-1 text-xs text-neutral-300">
      <summary className="cursor-pointer">
        {original ? "Original generated video" : "Edit individual source clips"} · trim, extend and
        rearrange
      </summary>
      <p className="max-h-28 overflow-auto whitespace-pre-line py-2">{notes}</p>
      <button
        type="button"
        className="mb-2 rounded-md bg-neutral-800 px-3 py-2 hover:bg-neutral-700"
        onClick={() => setActiveCompPath(original ? "index.html" : "original-export.html")}
      >
        {original ? "Back to editable clips" : "View original generated video"}
      </button>
    </details>
  );
}
