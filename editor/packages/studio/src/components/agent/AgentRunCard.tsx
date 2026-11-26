// One agent operation as a card (St-AgentApproval, St-AgentSelection): avatar + title, a status
// badge, the steps with done / current / to-do markers, an optional state illustration, and the
// actions (approve / reject, pause / stop, …). Shared by workspace runs and Studio proposals.
import type { ReactNode } from "react";
import { illustrationSrc, type StudioIllustrationName } from "../ui";
import { AgentIcon, type AgentIconName } from "./AgentIcon";
import { withContentKeys } from "./stableKeys";

export type AgentStepState = "done" | "now" | "todo" | "failed" | "paused";
export type AgentBadgeTone = "warn" | "neutral" | "ok" | "danger";

export interface AgentRunCardView {
  title: string;
  badge: { label: string; tone: AgentBadgeTone; icon: AgentIconName };
  steps: { state: AgentStepState; text: string }[];
  scene?: StudioIllustrationName;
  error?: string;
  summary?: string;
}

const BADGE_TONE: Record<AgentBadgeTone, string> = {
  warn: "bg-[var(--st-warn-bg)] text-[var(--st-warn)]",
  neutral: "bg-[var(--st-sf)] text-[var(--st-tx)] shadow-[inset_0_0_0_1px_var(--st-bd)]",
  ok: "bg-[var(--st-ok-bg)] text-[var(--st-ok)]",
  danger: "bg-[var(--st-danger-bg)] text-[var(--st-danger)]",
};

function StepMarker({ state }: { state: AgentStepState }) {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--st-sel)] text-[var(--st-on-sel)]">
        <AgentIcon name="check" size={12} strokeWidth={3} />
      </span>
    );
  if (state === "now")
    return (
      <span className="box-border h-5 w-5 flex-none animate-spin rounded-full border-[2.5px] border-[var(--st-hd)] border-t-[var(--st-tx)] motion-reduce:animate-none" />
    );
  if (state === "failed")
    return (
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--st-danger-bg)] text-[var(--st-danger)]">
        <AgentIcon name="close" size={11} strokeWidth={3} />
      </span>
    );
  if (state === "paused")
    return (
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full shadow-[inset_0_0_0_1.5px_var(--st-sbd)]">
        <AgentIcon name="pause" size={10} strokeWidth={3} />
      </span>
    );
  return (
    <span className="h-5 w-5 flex-none rounded-full shadow-[inset_0_0_0_1.5px_var(--st-sbd)]" />
  );
}

export function AgentRunCard({
  view,
  label,
  actions,
  children,
}: {
  view: AgentRunCardView;
  /** Accessible name of the card ("Acțiunea agentului" or "Propunere AI"). */
  label: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article
      aria-label={label}
      className="flex flex-col gap-3 rounded-[18px] bg-[var(--st-sf)] p-3.5 shadow-[inset_0_0_0_1px_var(--st-bd)]"
    >
      {/* A 4px gap and 5px badge padding keep "Titlu și tranziție" on one line at the 340px panel width
          (Inter Variable sets this badge wider than the board). Longer titles wrap. */}
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <img
            src={illustrationSrc("agent-avatar-duo")}
            alt=""
            className="h-6 w-6 flex-none rounded-full object-cover"
          />
          <b className="min-w-0 break-words text-sm font-semibold leading-[18px] text-[var(--st-tx)]">
            {view.title}
          </b>
        </span>
        <span
          role="status"
          className={`inline-flex h-6 flex-none items-center gap-[5px] whitespace-nowrap rounded-sm px-[5px] text-xs font-semibold ${BADGE_TONE[view.badge.tone]}`}
        >
          <AgentIcon name={view.badge.icon} size={12} strokeWidth={2.4} />
          {view.badge.label}
        </span>
      </div>
      {view.scene ? (
        <div className="flex justify-center">
          <img
            src={illustrationSrc(view.scene)}
            alt=""
            className="h-[88px] w-[88px] object-contain"
          />
        </div>
      ) : null}
      {view.steps.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {withContentKeys(view.steps, (step) => `${step.state}:${step.text}`).map(
            ({ key, item: step }) => (
              <li
                key={key}
                className={`flex items-center gap-2.5 text-[13px] leading-[18px] ${
                  step.state === "now" ? "font-semibold" : "font-medium"
                } ${step.state === "todo" ? "text-[var(--st-t2)]" : "text-[var(--st-tx)]"}`}
              >
                <StepMarker state={step.state} />
                <span className="min-w-0 break-words">{step.text}</span>
              </li>
            ),
          )}
        </ol>
      ) : null}
      {view.summary ? (
        <p className="m-0 whitespace-pre-wrap text-[13px] leading-[19px] text-[var(--st-tx)]">
          {view.summary}
        </p>
      ) : null}
      {view.error ? (
        <p role="alert" className="m-0 text-xs text-[var(--st-danger)]">
          {view.error}
        </p>
      ) : null}
      {children}
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </article>
  );
}

/** The user's message, right aligned on the selected surface. */
export function AgentUserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="m-0 max-w-[86%] whitespace-pre-wrap break-words rounded-[18px_18px_6px_18px] bg-[var(--st-sel)] px-3.5 py-2.5 text-sm leading-5 text-[var(--st-on-sel)]">
        {text}
      </p>
    </div>
  );
}
