// Start of the conversation (St-Agent): "La ce vrei să lucrăm?", recommended steps with
// "Fă asta" / "Explică", and the offline card when the agent service cannot be reached.
import { useState } from "react";
import { t } from "../../i18n/translate";
import { illustrationSrc } from "../ui";
import type { AgentSuggestion } from "./agentModel";
import { AgentIconButton, AgentPill } from "./AgentControls";
import type { AgentConnection } from "./useWorkspaceAgent";

function SuggestionCard({
  suggestion,
  phone,
  disabled,
  onAccept,
  onDismiss,
}: {
  suggestion: AgentSuggestion;
  phone: boolean;
  disabled: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [explained, setExplained] = useState(false);
  return (
    <article className="flex flex-col gap-2.5 rounded-[16px] bg-[var(--st-sf)] p-3 shadow-[inset_0_0_0_1px_var(--st-bd)]">
      <b className="text-sm font-semibold leading-5 text-[var(--st-tx)]">{suggestion.title}</b>
      {explained && suggestion.description ? (
        <p className="m-0 text-[13px] leading-[19px] text-[var(--st-t2)]">
          {suggestion.description}
        </p>
      ) : null}
      <div className="flex items-center gap-1.5">
        <AgentPill
          variant="primary"
          height={phone ? 44 : 32}
          disabled={disabled}
          onClick={onAccept}
        >
          {t("agent.doIt")}
        </AgentPill>
        <AgentPill
          variant="ghost"
          height={phone ? 44 : 32}
          className="!px-3"
          aria-expanded={explained}
          onClick={() => setExplained((value) => !value)}
        >
          {t("agent.explain")}
        </AgentPill>
        <span className="flex-1" />
        {explained ? (
          <AgentIconButton
            icon="close"
            size={28}
            iconSize={14}
            label={t("agent.hideSuggestion")}
            onClick={onDismiss}
          />
        ) : null}
      </div>
    </article>
  );
}

export function AgentOffline({ phone, onRetry }: { phone: boolean; onRetry: () => void }) {
  return (
    <section
      role="status"
      className="flex flex-col items-center gap-3 rounded-[18px] bg-[var(--st-sf)] p-4 text-center shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      <img
        src={illustrationSrc("agent-offline")}
        alt=""
        className={phone ? "h-[120px] w-[120px] object-contain" : "h-24 w-24 object-contain"}
      />
      <b className="font-display text-base font-semibold tracking-[-0.02em] text-[var(--st-tx)]">
        {t("agent.offlineTitle")}
      </b>
      <AgentPill height={phone ? 44 : 36} icon="refresh" onClick={onRetry}>
        {t("agent.retry")}
      </AgentPill>
    </section>
  );
}

export function AgentWelcome({
  connection,
  suggestions,
  phone,
  busy,
  onAccept,
  onDismiss,
  onReconnect,
}: {
  connection: AgentConnection;
  suggestions: AgentSuggestion[];
  phone: boolean;
  busy: boolean;
  onAccept: (suggestion: AgentSuggestion) => void;
  onDismiss: (id: string) => void;
  onReconnect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {phone && connection !== "offline" ? (
        <div className="flex justify-center">
          <img
            src={illustrationSrc("agent-working")}
            alt=""
            className="h-[140px] w-[140px] object-contain"
          />
        </div>
      ) : null}
      <h3
        className={`m-0 font-display font-semibold leading-tight tracking-[-0.02em] text-[var(--st-tx)] ${
          phone ? "text-[22px]" : "text-lg"
        }`}
      >
        {t("agent.heading")}
      </h3>
      {connection === "offline" ? <AgentOffline phone={phone} onRetry={onReconnect} /> : null}
      {connection === "connecting" ? (
        <p role="status" className="m-0 text-[13px] font-semibold text-[var(--st-t2)]">
          {t("agent.connecting")}
        </p>
      ) : null}
      {connection === "online" && suggestions.length > 0 ? (
        <>
          <b className="text-[13px] font-semibold text-[var(--st-t2)]">{t("agent.suggestions")}</b>
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              phone={phone}
              disabled={busy}
              onAccept={() => onAccept(suggestion)}
              onDismiss={() => onDismiss(suggestion.id)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
