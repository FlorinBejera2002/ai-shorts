// A Studio composition proposal in the conversation: the message, the steps, and the
// approval with the source to review (propose → review → apply, undoable).
import { t } from "../../i18n/translate";
import type { AssistantProposal } from "../assistant/studioAssistantClient";
import { AgentPill } from "./AgentControls";
import { AgentRunCard, AgentUserBubble, type AgentRunCardView } from "./AgentRunCard";
import type { LocalExchange } from "./useAgentRun";

export function localExchangeView(exchange: LocalExchange): AgentRunCardView {
  const read = t("agent.localRead", { path: exchange.path });
  const prepare = t("agent.localPrepare");
  const apply = t("agent.localApply");
  switch (exchange.state) {
    case "working":
      return {
        title: t("agent.localTitle"),
        badge: { label: t("agent.status.running"), tone: "neutral", icon: "refresh" },
        steps: [
          { state: "done", text: read },
          { state: "now", text: prepare },
          { state: "todo", text: apply },
        ],
      };
    case "review":
      return {
        title: t("agent.localTitle"),
        badge: { label: t("agent.status.waiting_for_confirmation"), tone: "warn", icon: "clock" },
        steps: [
          { state: "done", text: read },
          { state: "done", text: prepare },
          { state: "todo", text: apply },
        ],
        summary: exchange.summary,
      };
    case "applied":
      return {
        title: t("agent.localTitle"),
        badge: { label: t("agent.status.completed"), tone: "ok", icon: "check" },
        steps: [
          { state: "done", text: read },
          { state: "done", text: prepare },
          { state: "done", text: apply },
        ],
        summary: exchange.summary,
      };
    case "rejected":
      return {
        title: t("agent.localTitle"),
        badge: { label: t("agent.status.rejected"), tone: "neutral", icon: "close" },
        steps: [],
        summary: exchange.summary,
      };
    default:
      return {
        title: t("agent.localTitle"),
        badge: { label: t("agent.status.failed"), tone: "danger", icon: "warning" },
        steps: [],
        scene: "agent-failed",
        error: exchange.error,
      };
  }
}

export function LocalExchangeItem({
  exchange,
  proposal,
  busy,
  blocked,
  phone,
  onApprove,
  onReject,
  onStop,
}: {
  exchange: LocalExchange;
  /** The pending proposal when this exchange awaits review. */
  proposal: AssistantProposal | null;
  busy: boolean;
  blocked: boolean;
  phone: boolean;
  onApprove: () => void;
  onReject: () => void;
  onStop: () => void;
}) {
  const height = phone ? 44 : 36;
  const reviewing = exchange.state === "review" && proposal !== null;
  const actions = reviewing ? (
    <>
      <AgentPill fill height={height} disabled={busy} onClick={onReject}>
        {t("agent.reject")}
      </AgentPill>
      <AgentPill
        fill
        height={height}
        variant="primary"
        icon="check"
        disabled={busy || blocked}
        onClick={onApprove}
      >
        {t("agent.approve")}
      </AgentPill>
    </>
  ) : exchange.state === "working" ? (
    <AgentPill fill height={height} icon="stop" onClick={onStop}>
      {t("agent.stop")}
    </AgentPill>
  ) : null;
  return (
    <div className="flex flex-col gap-3">
      <AgentUserBubble text={exchange.message} />
      <AgentRunCard
        view={localExchangeView(exchange)}
        label={reviewing ? t("agent.proposal") : t("agent.localTitle")}
        actions={actions}
      >
        {reviewing ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-[var(--st-t2)]">
              {t("agent.reviewSource")}
            </summary>
            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-sm p-2 text-[10px] text-[var(--st-tx)] shadow-[inset_0_0_0_1px_var(--st-bd)]">
              {proposal.html}
            </pre>
          </details>
        ) : null}
      </AgentRunCard>
    </div>
  );
}
