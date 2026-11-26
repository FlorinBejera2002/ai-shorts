// A workspace agent run in the conversation: the user's message, the operation card with its
// controls, the agent's reply and, for finished runs, the result link.
import { useState } from "react";
import { getStudioLocale, t } from "../../i18n/translate";
import type { MessageKey } from "../../i18n/dictionary";
import { actionTitle } from "./agentActionNames";
import {
  isDeleteApproval,
  safeAgentRoute,
  type AgentCommand,
  type AgentRun,
  type AgentStatus,
} from "./agentModel";
import { AgentPill } from "./AgentControls";
import type { AgentIconName } from "./AgentIcon";
import {
  AgentRunCard,
  AgentUserBubble,
  type AgentBadgeTone,
  type AgentRunCardView,
  type AgentStepState,
} from "./AgentRunCard";
import { AgentResourceUpload } from "./AgentResourceUpload";
import type { StudioIllustrationName } from "../ui";

const CURRENT_STEP: Record<AgentStatus, AgentStepState> = {
  planning: "now",
  running: "now",
  cancel_requested: "now",
  waiting_for_confirmation: "todo",
  waiting_for_resources: "todo",
  cancelled: "todo",
  paused: "paused",
  failed: "failed",
  completed: "done",
};

const BADGE: Record<AgentStatus, [AgentBadgeTone, AgentIconName]> = {
  planning: ["neutral", "refresh"],
  running: ["neutral", "refresh"],
  cancel_requested: ["neutral", "stop"],
  waiting_for_confirmation: ["warn", "clock"],
  waiting_for_resources: ["warn", "upload"],
  paused: ["neutral", "pause"],
  cancelled: ["neutral", "stop"],
  completed: ["ok", "check"],
  failed: ["danger", "warning"],
};

// Board states (approval, working) show no picture; the other states use their scene.
const SCENE: Partial<Record<AgentStatus, StudioIllustrationName>> = {
  waiting_for_resources: "agent-resources",
  paused: "agent-paused",
  cancelled: "agent-stopped",
  failed: "agent-failed",
};

/** The approval preview names the change when it has a title ("Titlu și tranziție"). */
function previewTitle(run: AgentRun): string | null {
  const title = run.approval_preview?.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

export function workspaceRunView(run: AgentRun): AgentRunCardView {
  const locale = getStudioLocale();
  const [tone, icon] = BADGE[run.status];
  const steps: AgentRunCardView["steps"] = (run.steps ?? []).map((step) => ({
    state: "done" as const,
    text: step.result?.summary?.trim() || actionTitle(step.action, locale),
  }));
  if (run.action)
    steps.push({
      state: CURRENT_STEP[run.status],
      // While it waits for approval, the open step is applying the change to the project.
      text:
        run.status === "waiting_for_confirmation"
          ? t("agent.localApply")
          : actionTitle(run.action, locale),
    });
  const deleting = run.status === "waiting_for_confirmation" && isDeleteApproval(run);
  return {
    title: previewTitle(run) ?? (run.action ? actionTitle(run.action, locale) : t("agent.title")),
    badge: { label: t(`agent.status.${run.status}` as MessageKey), tone, icon },
    steps,
    scene: deleting ? "delete" : SCENE[run.status],
    error: run.error,
  };
}

function runActions({
  run,
  busy,
  phone,
  onControl,
}: {
  run: AgentRun;
  busy: boolean;
  phone: boolean;
  onControl: (run: AgentRun, command: AgentCommand) => void;
}) {
  const height = phone ? 44 : 36;
  const stop = (
    <AgentPill
      fill
      height={height}
      icon="stop"
      disabled={busy}
      onClick={() => onControl(run, "stop")}
    >
      {t("agent.stop")}
    </AgentPill>
  );
  switch (run.status) {
    case "waiting_for_confirmation": {
      const danger = isDeleteApproval(run);
      return (
        <>
          <AgentPill fill height={height} disabled={busy} onClick={() => onControl(run, "reject")}>
            {t("agent.reject")}
          </AgentPill>
          <AgentPill
            fill
            height={height}
            variant={danger ? "danger" : "primary"}
            icon={danger ? undefined : "check"}
            disabled={busy}
            onClick={() => onControl(run, "approve")}
          >
            {danger ? t("agent.approveDelete") : t("agent.approve")}
          </AgentPill>
        </>
      );
    }
    case "planning":
    case "running":
      return (
        <>
          <AgentPill fill height={height} disabled={busy} onClick={() => onControl(run, "pause")}>
            {t("agent.pause")}
          </AgentPill>
          {stop}
        </>
      );
    case "paused":
      return (
        <>
          <AgentPill
            fill
            height={height}
            variant="primary"
            icon="play"
            disabled={busy}
            onClick={() => onControl(run, "resume")}
          >
            {t("agent.resume")}
          </AgentPill>
          {stop}
        </>
      );
    case "completed":
      return run.result?.undo ? (
        <AgentPill
          height={height}
          icon="refresh"
          disabled={busy}
          onClick={() => onControl(run, "undo")}
        >
          {t("agent.undo")}
        </AgentPill>
      ) : null;
    default:
      return null;
  }
}

/** Opens an app route (result link) in the SneepCut app that opened Studio. */
function appUrl(route: string): string | null {
  try {
    const origin = document.referrer ? new URL(document.referrer).origin : null;
    return origin ? new URL(route, origin).href : null;
  } catch {
    return null;
  }
}

export function WorkspaceRunItem({
  run,
  busy,
  phone,
  projectId,
  onControl,
  onRetry,
}: {
  run: AgentRun;
  busy: boolean;
  phone: boolean;
  projectId: string;
  onControl: (run: AgentRun, command: AgentCommand, resourceIds?: string[]) => void;
  onRetry: (run: AgentRun) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const hasOperation = Boolean(run.action || run.steps?.length || run.approval_preview);
  const reply = run.reply || run.result?.summary;
  const route = run.status === "completed" ? safeAgentRoute(run.result?.route) : null;
  const href = route ? appUrl(route) : null;
  const studioWaiter =
    run.status === "waiting_for_resources" &&
    (run.missing_resources ?? []).some((need) => need.kind === "studio_asset");
  const actions =
    run.status === "failed" ? (
      <AgentPill
        fill
        height={phone ? 44 : 36}
        variant="primary"
        icon="refresh"
        disabled={busy}
        onClick={() => onRetry(run)}
      >
        {t("agent.retry")}
      </AgentPill>
    ) : run.status === "waiting_for_resources" ? (
      <>
        <AgentPill
          fill
          height={phone ? 44 : 36}
          variant="primary"
          disabled={busy || uploading}
          onClick={() => onControl(run, "resume")}
        >
          {t("agent.checkContinue")}
        </AgentPill>
        <AgentPill
          fill
          height={phone ? 44 : 36}
          icon="stop"
          disabled={busy}
          onClick={() => onControl(run, "stop")}
        >
          {t("agent.stop")}
        </AgentPill>
      </>
    ) : (
      runActions({ run, busy, phone, onControl })
    );
  return (
    <div className="flex flex-col gap-3" data-agent-run={run.id}>
      {run.message ? <AgentUserBubble text={run.message} /> : null}
      {hasOperation ? (
        <AgentRunCard view={workspaceRunView(run)} label={t("agent.title")} actions={actions}>
          {run.missing_resources?.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] text-[var(--st-tx)]">
              {run.missing_resources.map((need) => (
                <li key={`${need.kind}:${need.target_id ?? ""}:${need.label}`}>{need.label}</li>
              ))}
            </ul>
          ) : null}
          {studioWaiter ? (
            <AgentResourceUpload
              projectId={projectId}
              phone={phone}
              onBusy={setUploading}
              onUploaded={() => onControl(run, "resume")}
            />
          ) : null}
          {run.cost_credits > 0 ? (
            <span className="text-xs font-semibold text-[var(--st-t2)]">
              {t("agent.credits", { n: run.cost_credits })}
            </span>
          ) : null}
        </AgentRunCard>
      ) : run.error ? (
        <p role="alert" className="m-0 text-xs text-[var(--st-danger)]">
          {run.error}
        </p>
      ) : null}
      {reply ? (
        <p className="m-0 whitespace-pre-wrap text-sm leading-5 text-[var(--st-tx)]">{reply}</p>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-full px-4 text-[13px] font-semibold text-[var(--st-tx)] shadow-[inset_0_0_0_1.5px_var(--st-sbd)] hover:bg-[var(--st-sub)]"
        >
          {t("agent.viewResult")}
        </a>
      ) : null}
    </div>
  );
}
