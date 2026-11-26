// What the Ana și Radu panel does: one composer, two engines. When the workspace agent is
// reachable, messages become workspace runs (with the Studio project and selection as context).
// When it is offline, Studio's own assistant proposes composition edits for review. Applied
// edits show "Agentul a aplicat modificarea" with Undo.
import { useRef, useState } from "react";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { getStudioLocale, t } from "../../i18n/translate";
import { studioScope, type AgentRun, type AgentSuggestion } from "./agentModel";
import {
  agentContextLabel,
  clearAgentContext,
  useAgentContext,
  type AgentContextKind,
} from "./agentSession";
import { useAgentRun, type AgentDraft, type AgentRecordEdit } from "./useAgentRun";
import { useAgentToast } from "./useAgentToast";
import { useWorkspaceAgent, type WorkspaceAgentOptions } from "./useWorkspaceAgent";

/** A handed-over path names a composition only when it is an HTML file (ranges are labels). */
function compositionPath(path: string | undefined): string | null {
  return path && /^\S+\.html$/i.test(path) ? path : null;
}

/** Context for an instruction about one selected element. */
export interface AgentSelection {
  label: string;
  contextPreview?: string;
  /** Layer ids (hf id or element id) sent as the workspace agent's Studio selection. */
  ids?: string[];
}

export interface AgentChip {
  key: string;
  label: string;
  kind: AgentContextKind;
  onRemove?: () => void;
}

export interface AgentControllerOptions {
  recordEdit: AgentRecordEdit;
  projectTitle: string;
  /** Set while the user asks about a selected element ("Cere ajutor" in the inspector). */
  selection: AgentSelection | null;
  onSelectionSubmit?: (instruction: string) => Promise<AgentDraft | null>;
  onSelectionClear: () => void;
  workspace?: WorkspaceAgentOptions["api"];
}

export function useAgentController({
  recordEdit,
  projectTitle,
  selection,
  onSelectionSubmit,
  onSelectionClear,
  workspace: api,
}: AgentControllerOptions) {
  const shell = useStudioShellContext();
  const toasts = useAgentToast();
  const agent = useWorkspaceAgent({
    api,
    onStudioChange: (run, change) =>
      toasts.onRemoteChange(run, change, () => void agent.control(run, "undo")),
  });
  const local = useAgentRun(recordEdit, toasts.onLocalApplied);

  // A new hand-off context (openAgent({context})) prefills the composer once.
  const context = useAgentContext();
  const [seenContext, setSeenContext] = useState(context);
  const [draft, setDraft] = useState(context?.prompt ?? "");
  if (context !== seenContext) {
    setSeenContext(context);
    if (context?.prompt) setDraft(context.prompt);
  }
  const submitting = useRef(false);

  const chips: AgentChip[] = [];
  if (selection) {
    chips.push({
      key: "selection",
      label: t("agent.selectionChip", { label: selection.label }),
      kind: "selection",
      onRemove: onSelectionClear,
    });
  } else if (context && agentContextLabel(context)) {
    chips.push({
      key: "context",
      label: context.selection
        ? t("agent.selectionChip", { label: context.selection })
        : (agentContextLabel(context) ?? ""),
      kind: context.kind ?? (context.selection ? "selection" : "range"),
      onRemove: clearAgentContext,
    });
  } else {
    chips.push({
      key: "studio",
      label: t("agent.studioChip", { title: projectTitle }),
      kind: "studio",
    });
  }

  const online = agent.connection === "online";
  const busy = online ? agent.busy : local.busy;
  const canSend =
    !busy &&
    draft.trim().length > 0 &&
    agent.connection !== "connecting" &&
    (online || !local.writeBlockedReason);

  function connect() {
    void agent.connect(getStudioLocale(), shell.projectId);
  }

  /** Workspace context: the project and the selected layers (inspector selection or hand-off). */
  function scope() {
    const ids = selection ? (selection.ids ?? []) : (context?.ids ?? []);
    return studioScope(shell.projectId, getStudioLocale(), ids);
  }

  async function submit() {
    const text = draft.trim();
    if (!text || submitting.current) return;
    submitting.current = true;
    try {
      if (online) {
        const run = await agent.send(text, scope());
        if (run) setDraft((current) => (current.trim() === text ? "" : current));
        return;
      }
      const prepared =
        selection && onSelectionSubmit
          ? await onSelectionSubmit(text)
          : { message: text, path: compositionPath(context?.path) ?? local.activePath };
      if (!prepared) return;
      setDraft("");
      await local.submitDraft(prepared, text);
    } finally {
      submitting.current = false;
    }
  }

  function acceptSuggestion(suggestion: AgentSuggestion) {
    void agent.send(suggestion.title, scope(), suggestion);
  }

  function retryRun(run: AgentRun) {
    void agent.send(run.message, run.context);
  }

  return {
    agent,
    local,
    chips,
    draft,
    setDraft,
    canSend,
    busy,
    submit,
    connect,
    acceptSuggestion,
    retryRun,
    toast: toasts.toast,
    dismissToast: toasts.dismissToast,
    projectId: shell.projectId,
  };
}

export type AgentController = ReturnType<typeof useAgentController>;
