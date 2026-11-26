// The "Agentul a aplicat modificarea" toast and what follows a finished agent edit: the preview
// reloads, the open source editor re-reads the composition, and Undo is offered only while it
// would undo exactly the edit the toast announced.
import { useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { t } from "../../i18n/translate";
import type { AgentRun } from "./agentModel";
import { useLatestRef } from "./useLatestRef";
import { AGENT_EDIT_LABEL, type AppliedAgentEdit } from "./useAgentRun";
import type { AgentStudioChange } from "./useWorkspaceAgent";

export interface AgentToastState {
  id: number;
  message: string;
  undo?: () => void;
  /** Set for a local edit: its number in this session's sequence of agent edits. */
  localEdit?: number;
}

export function useAgentToast() {
  const shell = useStudioShellContext();
  const { setRefreshKey } = useStudioPlaybackContext();
  const files = useFileManagerContext();
  const shellRef = useLatestRef(shell);
  const filesRef = useLatestRef(files);
  const [toast, setToast] = useState<AgentToastState | null>(null);
  const toastId = useRef(0);
  const latestLocalEdit = useRef(0);

  const show = (message: string, extra: Omit<AgentToastState, "id" | "message"> = {}) =>
    setToast({ id: ++toastId.current, message, ...extra });

  /** The agent API wrote the composition on the server: reload what Studio shows of it. */
  async function reloadSourceEditor() {
    const current = filesRef.current;
    const path = current.editingPathRef.current;
    if (!path) return;
    // Unsaved local source edits stay; their save reports the conflict instead of being lost.
    const saved = await current.flushPendingSourceSave().catch(() => null);
    if (saved?.status !== "clean") return;
    const content = await current.readProjectFile(path).catch(() => null);
    if (content !== null) current.updateEditingFileContent(path, content);
  }

  /** A workspace run finished a Studio edit (or the undo of one). */
  function onRemoteChange(run: AgentRun, change: AgentStudioChange, undo: () => void) {
    setRefreshKey((value) => value + 1);
    void reloadSourceEditor();
    if (change === "undone") show(t("agent.undone"));
    else show(t("agent.applied"), run.result?.undo ? { undo } : {});
  }

  /** Undoes a local edit only while it is the latest agent edit, on top of the history, unchanged. */
  async function undoLocal(sequence: number, edit: AppliedAgentEdit) {
    if (sequence !== latestLocalEdit.current) return;
    if (shellRef.current.editHistory.undoLabel !== AGENT_EDIT_LABEL) return;
    const current = await filesRef.current.readProjectFile(edit.path).catch(() => null);
    if (current !== edit.after) return;
    await shellRef.current.handleUndo();
  }

  /** Studio's own assistant applied a reviewed edit (recorded in the edit history). */
  function onLocalApplied(edit: AppliedAgentEdit) {
    const sequence = ++latestLocalEdit.current;
    show(t("agent.applied"), { localEdit: sequence, undo: () => void undoLocal(sequence, edit) });
  }

  // A local edit's Undo is shown only while it can still undo that edit.
  const undoAvailable =
    !!toast?.undo &&
    (toast.localEdit === undefined ||
      (toast.localEdit === latestLocalEdit.current &&
        shell.editHistory.undoLabel === AGENT_EDIT_LABEL));

  return {
    toast: toast && !undoAvailable ? { ...toast, undo: undefined } : toast,
    dismissToast: () => setToast(null),
    onRemoteChange,
    onLocalApplied,
  };
}
