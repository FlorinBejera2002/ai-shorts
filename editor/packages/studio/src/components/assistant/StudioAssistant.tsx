import { useEffect, useRef, useState } from "react";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import type { usePersistentEditHistory } from "../../hooks/usePersistentEditHistory";
import { requestAssistantProposal, type AssistantProposal } from "./studioAssistantClient";
import { ASSISTANT_DRAFT_EVENT, type AssistantDraft } from "./assistantDraft";

export interface StudioAssistantProps {
  recordEdit: ReturnType<typeof usePersistentEditHistory>["recordEdit"];
}

export function StudioAssistant({ recordEdit }: StudioAssistantProps) {
  const { projectId, activeCompPath, writeBlockedReason, waitForPendingDomEditSaves, showToast } =
    useStudioShellContext();
  const { setRefreshKey } = useStudioPlaybackContext();
  const files = useFileManagerContext();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [message, setMessage] = useState("");
  const [draftPath, setDraftPath] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const openDraft = (event: Event) => {
      if (request.current) return;
      const draft = (event as CustomEvent<AssistantDraft>).detail;
      setMessage(draft.message);
      setDraftPath(draft.path);
      setProposal(null);
      setError(null);
      dialog.current?.showModal();
    };
    window.addEventListener(ASSISTANT_DRAFT_EVENT, openDraft);
    return () => window.removeEventListener(ASSISTANT_DRAFT_EVENT, openDraft);
  }, []);

  async function run(apply: boolean) {
    if (request.current || writeBlockedReason) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setApplying(apply);
    setError(null);
    try {
      const saved = await files.flushPendingSourceSave();
      if (saved.status !== "clean")
        throw new Error("Save or resolve the current source edits before using the assistant.");
      await waitForPendingDomEditSaves();
      if (controller.signal.aborted) return;
      if (apply && proposal) {
        if (proposal.projectId !== projectId)
          throw new Error("The project changed. Generate a new proposal before applying.");
        // The original source remains the write precondition, even if an editor
        // read has since observed a newer version. Never overwrite newer edits.
        await files.writeProjectFile(proposal.path, proposal.html, proposal.source);
        files.updateEditingFileContent(proposal.path, proposal.html);
        setRefreshKey((value) => value + 1);
        setProposal(null);
        await recordEdit({
          label: "AI edit",
          kind: "source",
          files: { [proposal.path]: { before: proposal.source, after: proposal.html } },
        });
        showToast("AI edit applied. You can undo it from the toolbar.", "info");
      } else {
        const path = draftPath ?? activeCompPath ?? "index.html";
        const source = await files.readProjectFile(path);
        if (controller.signal.aborted) return;
        const result = await requestAssistantProposal(
          projectId,
          path,
          source,
          message.trim(),
          controller.signal,
        );
        if (!controller.signal.aborted) setProposal(result);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not complete the AI edit.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
        setApplying(false);
      }
    }
  }

  const button =
    "rounded-md border border-neutral-700 px-3 py-2 text-xs hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraftPath(null);
          dialog.current?.showModal();
        }}
        className="h-7 rounded-md px-2.5 text-[11px] font-medium text-neutral-300 hover:bg-neutral-800"
      >
        AI assistant
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="studio-assistant-title"
        className="m-auto max-h-[85vh] w-[min(32rem,90vw)] overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 backdrop:bg-black/60"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="studio-assistant-title" className="text-sm font-semibold">
            Creative assistant
          </h2>
          <button type="button" className={button} onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-400">
          Edit text, layout, colors and animation with SneepCut AI. Review the proposed changes
          before applying them.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(false);
          }}
        >
          <label htmlFor="studio-assistant-prompt" className="mb-2 block text-xs">
            Describe your edit
          </label>
          <textarea
            id="studio-assistant-prompt"
            value={message}
            maxLength={10000}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            required
            disabled={busy}
            className="mb-3 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-studio-accent"
          />
          <button
            type="submit"
            disabled={busy || !message.trim() || !!writeBlockedReason}
            className={button}
          >
            {busy ? "Working…" : "Generate proposal"}
          </button>
          {busy && !applying && (
            <button
              type="button"
              className={`${button} ml-2`}
              onClick={() => request.current?.abort()}
            >
              Cancel
            </button>
          )}
        </form>
        {writeBlockedReason && (
          <p role="alert" className="mt-3 text-xs text-amber-300">
            {writeBlockedReason}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-300">
            {error}
          </p>
        )}
        {proposal && (
          <section
            aria-label="AI proposal"
            className="mt-4 space-y-3 rounded-md border border-neutral-700 p-3"
          >
            <p className="text-xs text-neutral-400">Composition: {proposal.path}</p>
            <p className="whitespace-pre-wrap text-sm">{proposal.summary}</p>
            <details>
              <summary className="cursor-pointer text-xs">Review composition source</summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-sm bg-neutral-950 p-2 text-[10px]">
                {proposal.html}
              </pre>
            </details>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !!writeBlockedReason}
                className="rounded-md bg-studio-accent px-3 py-2 text-xs font-medium text-neutral-950 disabled:opacity-50"
                onClick={() => void run(true)}
              >
                Apply edit
              </button>
              <button
                type="button"
                disabled={busy}
                className={button}
                onClick={() => setProposal(null)}
              >
                Discard
              </button>
            </div>
          </section>
        )}
      </dialog>
    </>
  );
}
