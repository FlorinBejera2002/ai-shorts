// Workspace agent (Ana și Radu) data model, shared with the app's agent API contract.
// Pure helpers only: no React, no fetch.

export type AgentStatus =
  | "planning"
  | "running"
  | "waiting_for_confirmation"
  | "waiting_for_resources"
  | "paused"
  | "cancel_requested"
  | "cancelled"
  | "completed"
  | "failed";

export const AGENT_STATUSES: readonly AgentStatus[] = [
  "planning",
  "running",
  "waiting_for_confirmation",
  "waiting_for_resources",
  "paused",
  "cancel_requested",
  "cancelled",
  "completed",
  "failed",
];

export interface AgentContextScope {
  route: string;
  locale?: "ro" | "en";
  project_id?: string;
  studio_selection?: string[];
}

export interface AgentAction {
  name: string;
  input: Record<string, unknown>;
}

export interface AgentRunResult {
  summary?: string;
  route?: string;
  data?: Record<string, unknown>;
  pending?: boolean;
  undo?: unknown;
}

export interface AgentRun {
  id: string;
  message: string;
  reply: string;
  status: AgentStatus;
  context: AgentContextScope;
  action?: AgentAction;
  missing_resources?: { kind: string; label: string; target_id?: string }[];
  approval_preview?: Record<string, unknown>;
  steps?: { action: AgentAction; result?: AgentRunResult }[];
  result?: AgentRunResult;
  error?: string;
  created_at: string;
  updated_at: string;
  revision: number;
  cost_credits: number;
}

export interface AgentSuggestion {
  id: string;
  title: string;
  description: string;
  action: AgentAction;
  missing_resources: string[];
  cost_credits: number;
}

export interface AgentRunRequest {
  request_id: string;
  message: string;
  context: AgentContextScope;
  suggestion_id?: string;
  resource_ids?: string[];
}

export type AgentCommand = "pause" | "resume" | "stop" | "approve" | "reject" | "undo";

export const STUDIO_ROUTE = "/dashboard/studio";
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The agent context for this Studio project. Only UUID projects and safe layer ids are sent. */
export function studioScope(
  projectId: string | null,
  locale: "ro" | "en",
  selection: readonly string[] = [],
): AgentContextScope {
  const projectScope = isUuid(projectId) ? { project_id: projectId } : {};
  const ids = selection.filter(
    (id) => id.length > 0 && id.length <= 200 && !["\0", "\r", "\n"].some((c) => id.includes(c)),
  );
  return {
    route: STUDIO_ROUTE,
    locale,
    ...projectScope,
    ...(ids.length && isUuid(projectId) ? { studio_selection: ids.slice(0, 20) } : {}),
  };
}

export function isAgentRun(value: unknown): value is AgentRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.id === "string" &&
    Number.isInteger(run.revision) &&
    typeof run.status === "string" &&
    (AGENT_STATUSES as readonly string[]).includes(run.status)
  );
}

/** Polls quickly while a run works, slowly while it waits for files, not at all otherwise. */
export function pollingDelay(runs: readonly AgentRun[]): number | null {
  if (runs.some((run) => ["planning", "running", "cancel_requested"].includes(run.status)))
    return 2000;
  if (runs.some((run) => run.status === "waiting_for_resources")) return 15000;
  return null;
}

/** Newer revisions win; the list stays in creation order. */
export function mergeRuns(previous: readonly AgentRun[], incoming: readonly AgentRun[]) {
  const records = new Map(previous.map((run) => [run.id, run]));
  for (const run of incoming) {
    if ((records.get(run.id)?.revision ?? -1) <= run.revision) records.set(run.id, run);
  }
  return [...records.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

const DELETE_ACTIONS = new Set([
  "stories.delete",
  "clips.delete",
  "folders.delete",
  "calendar.delete",
  "studio.assets.delete",
  "studio.renders.delete",
]);

/** Destructive approvals show the delete illustration and a danger action. */
export function isDeleteApproval(run: AgentRun): boolean {
  const action = run.approval_preview?.action ?? run.action?.name;
  return typeof action === "string" && DELETE_ACTIONS.has(action);
}

/** True when the run changed a Studio composition (the preview must reload). */
export function touchesStudio(run: AgentRun): boolean {
  const names = [run.action?.name, ...(run.steps ?? []).map((step) => step.action.name)];
  return names.some(
    (name) =>
      typeof name === "string" &&
      name.startsWith("studio.") &&
      !/\.(get|list)$/.test(name) &&
      !name.startsWith("studio.renders"),
  );
}

/** Studio-asset waiter that a Studio upload can resume (one per project at a time). */
export function studioResourceWaiter(runs: readonly AgentRun[]): AgentRun | undefined {
  const waiting = runs.filter(
    (run) =>
      run.status === "waiting_for_resources" &&
      (run.missing_resources ?? []).length > 0 &&
      (run.missing_resources ?? []).every((need) => need.kind === "studio_asset"),
  );
  return waiting.length === 1 ? waiting[0] : undefined;
}

/** App routes a result may link to (same allowlist as the app agent). */
export function safeAgentRoute(route?: string): string | null {
  if (!route || /[\\\s#]/.test(route)) return null;
  const pathname = route.split("?")[0];
  return /^\/dashboard(?:\/(?:studio|clips(?:\/[a-zA-Z0-9-]+(?:\/edit)?)?|calendar|publish|create|settings|brand|billing|jobs\/[a-zA-Z0-9-]+))?$/.test(
    pathname,
  )
    ? route
    : null;
}

// Studio upload limits (match the Studio upload route).
export const STUDIO_UPLOAD_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mov,.woff,.woff2,.ttf,.otf";
const UPLOAD_EXTENSIONS = new Set(STUDIO_UPLOAD_ACCEPT.split(","));
const MAX_UPLOAD_BYTES = 500 * 1024 ** 2 - 64 * 1024;

export function validStudioUpload(files: readonly Pick<File, "name" | "size">[]): boolean {
  if (!files.length || files.length > 8) return false;
  if (
    files.some(
      (file) =>
        !Number.isFinite(file.size) ||
        file.size <= 0 ||
        !UPLOAD_EXTENSIONS.has(file.name.slice(file.name.lastIndexOf(".")).toLowerCase()),
    )
  )
    return false;
  return files.reduce((total, file) => total + file.size, 0) < MAX_UPLOAD_BYTES;
}
