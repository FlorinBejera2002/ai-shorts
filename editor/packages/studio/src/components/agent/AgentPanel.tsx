// Ana și Radu panel. Desktop: a card docked in the inspector column (St-Agent: 340 wide,
// padding 14/14/12, 12px gaps). Phone: full screen over Studio (St-M-Agent).
// Header (avatar, title, collapse), context chips, conversation, composer.
import { useRef, type CSSProperties } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { t, useLocale } from "../../i18n/translate";
import { illustrationSrc } from "../ui";
import { AgentComposer } from "./AgentComposer";
import { AgentIconButton, AgentPill } from "./AgentControls";
import { AgentIcon, type AgentIconName } from "./AgentIcon";
import { AgentWelcome } from "./AgentWelcome";
import { LocalExchangeItem } from "./LocalExchangeItem";
import type { AgentContextKind } from "./agentSession";
import type { AgentChip, AgentController, AgentSelection } from "./useAgentController";
import { WorkspaceRunItem } from "./WorkspaceRunItem";

const CHIP_ICON: Record<AgentContextKind, AgentIconName> = {
  studio: "media",
  selection: "subtitles",
  range: "range",
  block: "layers",
  lint: "warning",
  frame: "media",
};

function ContextChip({ chip }: { chip: AgentChip }) {
  return (
    <span
      className={`inline-flex h-8 max-w-full flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--st-sf)] pl-2.5 text-xs font-semibold text-[var(--st-tx)] shadow-[inset_0_0_0_1px_var(--st-bd)] ${
        chip.onRemove ? "pr-1" : "pr-3"
      }`}
    >
      <AgentIcon name={CHIP_ICON[chip.kind]} size={14} />
      <span className="min-w-0 truncate">{chip.label}</span>
      {chip.onRemove ? (
        <AgentIconButton
          icon="close"
          size={28}
          iconSize={14}
          label={t("agent.removeContext")}
          onClick={chip.onRemove}
        />
      ) : null}
    </span>
  );
}

export interface AgentPanelProps {
  controller: AgentController;
  selection: AgentSelection | null;
  phone: boolean;
  /** Desktop position from the shell (inspector column). */
  dockStyle: CSSProperties | null;
  onClose: () => void;
}

export function AgentPanel({ controller, selection, phone, dockStyle, onClose }: AgentPanelProps) {
  useLocale();
  const composer = useRef<HTMLTextAreaElement>(null);
  const { agent, local } = controller;

  useMountEffect(() => {
    if (agent.connection === "idle" || agent.connection === "offline") controller.connect();
    composer.current?.focus();
  });

  const hasConversation = agent.runs.length > 0 || local.exchanges.length > 0;
  const position = phone
    ? "fixed inset-0 z-[160] gap-3.5 bg-[var(--st-bg)] px-4 pb-6 pt-2.5"
    : "fixed z-[88] gap-3 rounded-card bg-[var(--st-sf)] px-3.5 pb-3 pt-3.5 shadow-studio";
  const fallbackDock: CSSProperties = { top: 76, right: 12, width: 340, bottom: 284 };

  return (
    <aside
      id="workspace-agent-panel"
      aria-label={t("agent.title")}
      data-agent-panel={phone ? "phone" : "desktop"}
      className={`flex min-h-0 flex-col ${position}`}
      style={phone ? undefined : (dockStyle ?? fallbackDock)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={`flex flex-none items-center gap-2.5 ${phone ? "min-h-11" : "min-h-9"}`}>
        <img
          src={illustrationSrc("agent-avatar-duo")}
          alt=""
          className="h-8 w-8 flex-none rounded-full object-cover"
        />
        <h2
          className={`m-0 min-w-0 flex-1 truncate font-display font-semibold leading-6 tracking-[-0.02em] text-[var(--st-tx)] ${
            phone ? "text-[17px]" : "text-base"
          }`}
        >
          {t("agent.title")}
        </h2>
        <AgentIconButton
          icon={phone ? "close" : "chevronRight"}
          size={phone ? 44 : 36}
          label={phone ? t("agent.close") : t("agent.collapse")}
          onClick={onClose}
        />
      </header>
      <div className="flex flex-none flex-wrap gap-1.5">
        {controller.chips.map((chip) => (
          <ContextChip key={chip.key} chip={chip} />
        ))}
      </div>
      {selection?.contextPreview ? (
        <details className="flex-none">
          <summary className="cursor-pointer text-[11px] font-semibold text-[var(--st-t2)]">
            {t("agent.contextPreview")}
          </summary>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-sm p-2 text-[11px] text-[var(--st-t2)] shadow-[inset_0_0_0_1px_var(--st-bd)]">
            {selection.contextPreview}
          </pre>
        </details>
      ) : null}
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${phone ? "gap-3.5" : "gap-3"}`}
        aria-live="polite"
      >
        {!hasConversation || agent.connection === "offline" ? (
          <AgentWelcome
            connection={agent.connection}
            suggestions={hasConversation ? [] : agent.suggestions}
            phone={phone}
            busy={controller.busy}
            onAccept={controller.acceptSuggestion}
            onDismiss={(id) => void agent.dismiss(id)}
            onReconnect={controller.connect}
          />
        ) : null}
        {agent.runs.map((run) => (
          <WorkspaceRunItem
            key={run.id}
            run={run}
            busy={agent.busy}
            phone={phone}
            projectId={controller.projectId}
            onControl={(target, command, ids) => void agent.control(target, command, ids)}
            onRetry={controller.retryRun}
          />
        ))}
        {local.exchanges.map((exchange) => (
          <LocalExchangeItem
            key={exchange.id}
            exchange={exchange}
            proposal={exchange.state === "review" ? local.proposal : null}
            busy={local.busy}
            blocked={!!local.writeBlockedReason}
            phone={phone}
            onApprove={() => void local.applyProposal()}
            onReject={local.discardProposal}
            onStop={local.cancel}
          />
        ))}
        {local.writeBlockedReason && !online(agent.connection) ? (
          <p role="alert" className="m-0 text-xs text-[var(--st-warn)]">
            {local.writeBlockedReason}
          </p>
        ) : null}
        {agent.error ? (
          <div className="flex flex-none items-center gap-2">
            <p role="alert" className="m-0 min-w-0 flex-1 text-xs text-[var(--st-danger)]">
              {agent.error}
            </p>
            {agent.retryPending ? (
              <AgentPill
                height={phone ? 44 : 32}
                icon="refresh"
                disabled={agent.busy}
                onClick={() => void agent.retryFailed()}
              >
                {t("agent.retry")}
              </AgentPill>
            ) : null}
          </div>
        ) : null}
        {local.error && !local.exchanges.some((item) => item.error === local.error) ? (
          <p role="alert" className="m-0 text-xs text-[var(--st-danger)]">
            {local.error}
          </p>
        ) : null}
      </div>
      <AgentComposer
        ref={composer}
        value={controller.draft}
        onChange={controller.setDraft}
        onSubmit={() => void controller.submit()}
        disabled={false}
        canSend={controller.canSend}
        phone={phone}
      />
    </aside>
  );
}

function online(connection: string) {
  return connection === "online";
}
