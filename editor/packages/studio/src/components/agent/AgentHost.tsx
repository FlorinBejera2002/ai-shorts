// Mounts Ana și Radu: the floating launcher, the panel (docked in the inspector column on desktop,
// full screen on phone) and the "Agentul a aplicat modificarea" toast. Every former assistant and
// Ask agent entry point opens through here (openAgent, or the inspector's "Cere ajutor").
import { useStudioShellContext } from "../../contexts/StudioContext";
import { useMountEffect } from "../../hooks/useMountEffect";
import { t } from "../../i18n/translate";
import { useIsPhone } from "../shell/useIsPhone";
import { useProjectTitle } from "../shell/useProjectTitle";
import { StudioToast } from "../StudioToast";
import type { AgentApi } from "./agentApi";
import { AgentPanel } from "./AgentPanel";
import { closeAgent, openAgent, useAgentOpen } from "./agentSession";
import { AnaRaduLauncher } from "./AnaRaduLauncher";
import { useAgentController, type AgentSelection } from "./useAgentController";
import { useAgentDock } from "./useAgentDock";
import type { AgentDraft, AgentRecordEdit } from "./useAgentRun";

const TOAST_MS = 8000;

/** Dismisses one toast after TOAST_MS. Keyed by toast id, so each toast owns its timer. */
function AgentToastTimer({ onExpire }: { onExpire: () => void }) {
  useMountEffect(() => {
    const timer = window.setTimeout(onExpire, TOAST_MS);
    return () => window.clearTimeout(timer);
  });
  return null;
}

export interface AgentHostProps {
  recordEdit: AgentRecordEdit;
  /** Set while the user asks about a selected element. */
  selection: AgentSelection | null;
  onSelectionSubmit: (instruction: string) => Promise<AgentDraft | null>;
  /** Closes the selection request; the host closes the panel through agentSession. */
  onSelectionClose: () => void;
  /** Injected agent client (tests). */
  api?: AgentApi;
}

export function AgentHost({
  recordEdit,
  selection,
  onSelectionSubmit,
  onSelectionClose,
  api,
}: AgentHostProps) {
  const { projectId } = useStudioShellContext();
  const { title } = useProjectTitle(projectId);
  const phone = useIsPhone();
  const storeOpen = useAgentOpen();
  const open = storeOpen || selection !== null;
  const dock = useAgentDock(!phone);
  const controller = useAgentController({
    recordEdit,
    projectTitle: title,
    selection,
    onSelectionSubmit,
    onSelectionClear: onSelectionClose,
    workspace: api,
  });
  // The panel belongs to one project: closing on unmount stops a stale panel after a project switch.
  useMountEffect(() => () => closeAgent());

  const toast = controller.toast;

  return (
    <>
      {open ? (
        <AgentPanel
          controller={controller}
          selection={selection}
          phone={phone}
          dockStyle={dock?.panel ?? null}
          onClose={() => {
            closeAgent();
            onSelectionClose();
          }}
        />
      ) : (
        <AnaRaduLauncher phone={phone} onOpen={() => openAgent()} />
      )}
      {toast ? <AgentToastTimer key={toast.id} onExpire={controller.dismissToast} /> : null}
      {toast ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[91] -translate-x-1/2 [&>*]:pointer-events-auto"
          style={{ bottom: phone ? 100 : (dock?.toastBottom ?? 288) }}
        >
          <StudioToast
            key={toast.id}
            tone="success"
            message={toast.message}
            action={
              toast.undo
                ? {
                    label: t("agent.undo"),
                    onClick: () => {
                      toast.undo?.();
                      controller.dismissToast();
                    },
                  }
                : undefined
            }
            onDismiss={controller.dismissToast}
          />
        </div>
      ) : null}
    </>
  );
}
