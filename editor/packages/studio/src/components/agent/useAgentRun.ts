// Studio's own composition edits for Ana și Radu: read the composition, ask the Studio assistant
// for a version-checked proposal, review it, then apply or reject it. Applied edits are recorded
// in the edit history, so they can be undone like any other edit. Used when the workspace agent
// is offline, and for proposals about one composition.
import { useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { useMountEffect } from "../../hooks/useMountEffect";
import type { usePersistentEditHistory } from "../../hooks/usePersistentEditHistory";
import { t } from "../../i18n/translate";
import {
  requestAssistantProposal,
  type AssistantProposal,
} from "../assistant/studioAssistantClient";

export type AgentRecordEdit = ReturnType<typeof usePersistentEditHistory>["recordEdit"];

/** History label of an applied agent edit (Undo tooltip: "Undo AI edit"). */
export const AGENT_EDIT_LABEL = "AI edit";

export interface AgentDraft {
  message: string;
  path: string;
}

export type LocalExchangeState = "working" | "review" | "applied" | "rejected" | "failed";

/** One message to the Studio assistant and what became of it. */
export interface LocalExchange {
  id: number;
  message: string;
  path: string;
  state: LocalExchangeState;
  summary?: string;
  error?: string;
}

/** Runs one request at a time. A second submit while busy is ignored synchronously. */
/** An applied agent edit: the file and the content the agent wrote. */
export interface AppliedAgentEdit {
  path: string;
  after: string;
}

export function useAgentRun(
  recordEdit: AgentRecordEdit,
  onApplied?: (edit: AppliedAgentEdit) => void,
) {
  const { projectId, activeCompPath, writeBlockedReason, waitForPendingDomEditSaves } =
    useStudioShellContext();
  const { setRefreshKey } = useStudioPlaybackContext();
  const files = useFileManagerContext();
  const request = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [exchanges, setExchanges] = useState<LocalExchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useMountEffect(() => () => request.current?.abort());

  const update = (id: number, patch: Partial<LocalExchange>) =>
    setExchanges((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function runGuarded(
    apply: boolean,
    task: (signal: AbortSignal) => Promise<void>,
    onError?: (message: string) => void,
  ) {
    if (request.current || writeBlockedReason) return Promise.resolve();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setApplying(apply);
    setError(null);
    return task(controller.signal)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const text = cause instanceof Error ? cause.message : t("agent.errorGeneric");
        setError(text);
        onError?.(text);
      })
      .finally(() => {
        if (request.current === controller) {
          request.current = null;
          setBusy(false);
          setApplying(false);
        }
      });
  }

  function submitDraft(draft: AgentDraft, shownMessage = draft.message) {
    if (request.current || writeBlockedReason) return Promise.resolve();
    const id = nextId.current++;
    setExchanges((list) => [
      ...list,
      { id, message: shownMessage.trim(), path: draft.path, state: "working" },
    ]);
    return runGuarded(
      false,
      async (signal) => {
        const saved = await files.flushPendingSourceSave();
        if (saved.status !== "clean") throw new Error(t("agent.errorSaveFirst"));
        await waitForPendingDomEditSaves();
        if (signal.aborted) return;
        const source = await files.readProjectFile(draft.path);
        if (signal.aborted) return;
        const result = await requestAssistantProposal(
          projectId,
          draft.path,
          source,
          draft.message.trim(),
          signal,
        );
        if (signal.aborted) return;
        setProposal(result);
        update(id, { state: "review", summary: result.summary });
      },
      (text) => update(id, { state: "failed", error: text }),
    ).then(() => {
      // A stopped request leaves its exchange as stopped instead of working forever.
      setExchanges((list) =>
        list.map((item) =>
          item.id === id && item.state === "working"
            ? { ...item, state: "failed", error: t("agent.stopped") }
            : item,
        ),
      );
    });
  }

  const reviewId = () => [...exchanges].reverse().find((item) => item.state === "review")?.id;

  function applyProposal() {
    if (!proposal) return Promise.resolve();
    const id = reviewId();
    return runGuarded(true, async (signal) => {
      const saved = await files.flushPendingSourceSave();
      if (saved.status !== "clean") throw new Error(t("agent.errorSaveFirst"));
      await waitForPendingDomEditSaves();
      if (signal.aborted) return;
      if (proposal.projectId !== projectId) throw new Error(t("agent.errorProjectChanged"));
      // The original source remains the write precondition, even if an editor
      // read has since observed a newer version. Never overwrite newer edits.
      await files.writeProjectFile(proposal.path, proposal.html, proposal.source);
      files.updateEditingFileContent(proposal.path, proposal.html);
      setRefreshKey((value) => value + 1);
      setProposal(null);
      if (id !== undefined) update(id, { state: "applied" });
      await recordEdit({
        label: AGENT_EDIT_LABEL,
        kind: "source",
        files: { [proposal.path]: { before: proposal.source, after: proposal.html } },
      });
      onApplied?.({ path: proposal.path, after: proposal.html });
    });
  }

  function discardProposal() {
    const id = reviewId();
    if (id !== undefined) update(id, { state: "rejected" });
    setProposal(null);
  }

  return {
    activePath: activeCompPath ?? "index.html",
    projectId,
    writeBlockedReason,
    busy,
    applying,
    proposal,
    exchanges,
    error,
    submitDraft,
    applyProposal,
    cancel: () => request.current?.abort(),
    discardProposal,
  };
}

export type LocalAgentRun = ReturnType<typeof useAgentRun>;
