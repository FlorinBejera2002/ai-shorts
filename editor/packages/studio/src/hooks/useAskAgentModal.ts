import { buildProjectApiPath } from "../utils/projectRouting";
import { useState, useCallback } from "react";
import type { AgentDraft } from "../components/agent/useAgentRun";
import { readTagSnippetByTarget } from "../utils/sourcePatcher";
import { toProjectAbsolutePath, type AgentModalAnchorPoint } from "../utils/studioHelpers";
import { buildElementAgentPrompt, type DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player";

// ── Types ──

export interface UseAskAgentModalParams {
  projectId: string | null;
  activeCompPath: string | null;
  projectDir: string | null;
  projectIdRef: React.MutableRefObject<string | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  domEditSelection: DomEditSelection | null;
}

// ── Hook ──

export function useAskAgentModal({
  activeCompPath,
  projectDir,
  projectIdRef,
  domEditSelectionRef,
  domEditSelection,
}: UseAskAgentModalParams) {
  // ── State ──

  // The snippet is stored with the selection it belongs to, so a stale value is never used for a new selection.
  const [agentPromptTagSnippet, setAgentPromptTagSnippet] = useState<{
    selection: DomEditSelection;
    snippet: string;
  } | null>(null);
  const [agentPromptSelectionContext, setAgentPromptSelectionContext] = useState<
    string | undefined
  >();
  const [agentModalAnchorPoint, setAgentModalAnchorPoint] = useState<AgentModalAnchorPoint | null>(
    null,
  );
  const [copiedAgentPrompt, setCopiedAgentPrompt] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  // ── Callbacks ──

  const preloadAgentPromptSnippet = useCallback(
    async (selection: DomEditSelection) => {
      const pid = projectIdRef.current;
      if (!pid) return;

      const targetPath = selection.sourceFile || activeCompPath || "index.html";
      try {
        const response = await fetch(
          buildProjectApiPath(pid, `/files/${encodeURIComponent(targetPath)}`),
        );
        if (!response.ok) return;

        const data = (await response.json()) as { content?: string };
        const html = data.content;
        const tagSnippet =
          typeof html === "string" ? readTagSnippetByTarget(html, selection) : undefined;

        setAgentPromptTagSnippet((current) => {
          if (domEditSelectionRef.current !== selection) return current;
          return tagSnippet === undefined ? null : { selection, snippet: tagSnippet };
        });
      } catch {
        // Runtime outerHTML is still available as a synchronous copy fallback.
      }
    },
    [activeCompPath, domEditSelectionRef, projectIdRef],
  );

  const handleAskAgent = useCallback(() => {
    if (!domEditSelection) return;
    setAgentPromptTagSnippet(null);
    setAgentPromptSelectionContext(undefined);
    setAgentModalAnchorPoint(null);
    void preloadAgentPromptSnippet(domEditSelection);
    setAgentModalOpen(true);
  }, [domEditSelection, preloadAgentPromptSnippet]);

  // Builds the element prompt for Ana și Radu. The panel stays open so the run and its proposal are visible.
  const handleAgentModalSubmit = useCallback(
    async (userInstruction: string): Promise<AgentDraft | null> => {
      if (!domEditSelection) return null;

      const targetPath = domEditSelection.sourceFile || activeCompPath || "index.html";
      const preloadedSnippet =
        agentPromptTagSnippet?.selection === domEditSelection
          ? agentPromptTagSnippet.snippet
          : undefined;
      const tagSnippet = preloadedSnippet ?? domEditSelection.element.outerHTML;
      const prompt = buildElementAgentPrompt({
        selection: domEditSelection,
        currentTime: usePlayerStore.getState().currentTime,
        tagSnippet,
        selectionContext: agentPromptSelectionContext,
        userInstruction,
        sourceFilePath: toProjectAbsolutePath(projectDir, targetPath),
      });

      setAgentPromptSelectionContext(undefined);
      setAgentModalAnchorPoint(null);
      setCopiedAgentPrompt(false);
      return { message: prompt, path: targetPath };
    },
    [
      activeCompPath,
      agentPromptSelectionContext,
      agentPromptTagSnippet,
      domEditSelection,
      projectDir,
    ],
  );

  return {
    // State
    agentModalOpen,
    agentModalAnchorPoint,
    copiedAgentPrompt,
    agentPromptSelectionContext,

    // Setters (consumed by handlePreviewCanvasMouseDown and other callers)
    setAgentModalOpen,
    setAgentPromptSelectionContext,
    setAgentModalAnchorPoint,

    // Callbacks
    preloadAgentPromptSnippet,
    handleAskAgent,
    handleAgentModalSubmit,
  };
}
