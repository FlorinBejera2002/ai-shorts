import type { ComponentProps } from "react";
import { LintModal } from "./LintModal";
import { t } from "../i18n/translate";
import { AgentHost } from "./agent/AgentHost";
import type { AgentSelection } from "./agent/useAgentController";
import type { AgentRecordEdit } from "./agent/useAgentRun";
import { useAgentDock } from "./agent/useAgentDock";
import { StudioGlobalDragOverlay } from "./StudioGlobalDragOverlay";
import { StudioToast } from "./StudioToast";
import { StudioFeedbackCard } from "./feedback/StudioFeedbackCard";
import { buildAgentContextPreview } from "./editor/domEditingAgentPrompt";
import { useIsPhone } from "./shell/useIsPhone";
import type { useDomEditSession } from "../hooks/useDomEditSession";
import type { useToast } from "../hooks/useToast";

type LintFindings = ComponentProps<typeof LintModal>["findings"];
type DomEditSession = ReturnType<typeof useDomEditSession>;

export interface StudioOverlaysProps {
  projectId: string;
  recordEdit: AgentRecordEdit;
  projectDir?: string | null;
  lintModal: LintFindings | null;
  closeLintModal: () => void;
  consoleErrors: LintFindings | null;
  clearConsoleErrors: () => void;
  domEditSession: DomEditSession;
  activeCompPath: string | null;
  dragOverlayActive: boolean;
  toasts: ReturnType<typeof useToast>["toasts"];
  dismissToast: (id: number) => void;
}

/** The element the user asked Ana și Radu about, with the context and layer ids sent along. */
function agentSelection(session: DomEditSession, activeCompPath: string | null) {
  const selected = session.domEditSelection;
  if (!session.agentModalOpen || !selected) return null;
  const ids = [selected.hfId, selected.id].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const selection: AgentSelection = {
    label: selected.label,
    contextPreview: buildAgentContextPreview(selected, activeCompPath),
    ids: ids.slice(0, 1),
  };
  return selection;
}

/** Studio notices: one centred stack 4px above the bottom of the preview card (St-Toast). */
function ToastStack({
  toasts,
  dismissToast,
}: Pick<StudioOverlaysProps, "toasts" | "dismissToast">) {
  const phone = useIsPhone();
  const dock = useAgentDock(!phone && toasts.length > 0);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[91] flex -translate-x-1/2 flex-col items-center gap-2 [&>*]:pointer-events-auto"
      style={{ bottom: phone ? 100 : (dock?.toastBottom ?? 288) }}
    >
      {toasts.map((toast) => (
        <StudioToast
          key={toast.id}
          message={toast.message}
          tone={toast.tone === "error" ? "error" : "info"}
          leaving={toast.leaving}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}

/**
 * Floating overlays for the studio shell: lint / console-error dialogs, Ana și Radu (launcher,
 * panel and its toast), the global drag overlay, Studio toasts and the feedback card.
 * Extracted from `App.tsx` to keep the shell within the studio's 600-line decomposition budget.
 */
export function StudioOverlays({
  projectId,
  recordEdit,
  projectDir,
  lintModal,
  closeLintModal,
  consoleErrors,
  clearConsoleErrors,
  domEditSession,
  activeCompPath,
  dragOverlayActive,
  toasts,
  dismissToast,
}: StudioOverlaysProps) {
  return (
    <>
      {lintModal !== null && (
        <LintModal
          findings={lintModal}
          projectId={projectId}
          projectDir={projectDir}
          onClose={closeLintModal}
        />
      )}
      {/* One modal at a time — console errors wait behind an open lint modal
          instead of stacking two full-screen overlays. */}
      {lintModal === null && consoleErrors !== null && consoleErrors.length > 0 && (
        <LintModal
          findings={consoleErrors}
          projectId={projectId}
          projectDir={projectDir}
          title={t("lint.consoleTitle")}
          promptIntro="Fix these runtime console errors from the composition preview"
          onClose={clearConsoleErrors}
        />
      )}
      <AgentHost
        key={projectId}
        recordEdit={recordEdit}
        selection={agentSelection(domEditSession, activeCompPath)}
        onSelectionSubmit={domEditSession.handleAgentModalSubmit}
        onSelectionClose={() => {
          domEditSession.setAgentModalOpen(false);
          domEditSession.setAgentPromptSelectionContext(undefined);
          domEditSession.setAgentModalAnchorPoint(null);
        }}
      />
      {dragOverlayActive && <StudioGlobalDragOverlay />}
      <ToastStack toasts={toasts} dismissToast={dismissToast} />
      {/* The feedback card sits above the launcher so the two never overlap. */}
      <div className="pointer-events-none fixed bottom-[100px] right-6 z-[86] flex flex-col items-end gap-2 empty:hidden [&>*]:pointer-events-auto">
        <StudioFeedbackCard />
      </div>
    </>
  );
}
